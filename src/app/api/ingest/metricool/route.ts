/**
 * Analytics ingest.
 *
 * Deliberately provider-agnostic — nothing below knows what Metricool is. It
 * accepts normalized rows and upserts them. Today those rows are pushed by a
 * scheduled Claude agent that reads the Metricool MCP connector (that connector
 * is OAuth-bound to a Claude account and has no server-callable HTTP surface, so
 * a serverless function cannot fetch it directly). If Strive later moves to a
 * Metricool Advanced plan, a server-side REST sync can POST the same shape here
 * with no schema or dashboard change.
 *
 * Idempotent by construction: analytics_snapshots is keyed on
 * (client_id, network, metric, date), so replaying a payload rewrites rather
 * than duplicates.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { query, sql, one } from "@/lib/db";
import { timingSafeEqual, createHash } from "node:crypto";

export const runtime = "nodejs";

const Snapshot = z.object({
  network: z.string().min(1).max(40),
  metric: z.string().min(1).max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().finite(),
});

const Post = z.object({
  network: z.string().min(1).max(40),
  externalId: z.string().min(1).max(200),
  permalink: z.string().max(1000).optional().nullable(),
  thumbnailUrl: z.string().max(1000).optional().nullable(),
  caption: z.string().max(4000).optional().nullable(),
  publishedAt: z.string().optional().nullable(),
  metrics: z.record(z.string(), z.number()).default({}),
});

const Payload = z.object({
  source: z.string().default("metricool"),
  // Identify the client by whichever handle the caller has.
  blogId: z.union([z.number(), z.string()]).optional(),
  slug: z.string().optional(),
  clientId: z.string().uuid().optional(),
  snapshots: z.array(Snapshot).max(5000).default([]),
  posts: z.array(Post).max(500).default([]),
});

function authorized(req: NextRequest): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/**
 * Ingest status. Lets the sync agent (and the verification suite) confirm what
 * actually landed, rather than trusting the POST's own report of itself.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await sql<{ name: string; snapshots: string; last: Date | null }>`
    select c.name,
           count(s.*)::text as snapshots,
           max(s.fetched_at) as last
    from clients c
    left join analytics_snapshots s on s.client_id = c.id
    group by c.id, c.name
    order by c.name
  `;
  const run = await one<{ status: string; finished_at: Date | null }>`
    select status, finished_at from sync_runs order by started_at desc limit 1
  `;

  return NextResponse.json({
    ok: true,
    lastRun: run,
    clients: rows.map((r) => ({
      name: r.name,
      snapshots: Number(r.snapshots),
      lastFetched: r.last,
    })),
  });
}

/**
 * Prune snapshots older than a cutoff.
 *
 * Operationally this keeps the analytics table from growing without bound; it
 * also lets the verification suite clean up after itself so repeated runs stay
 * meaningful rather than colliding with their own leftovers.
 */
export async function DELETE(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const before = req.nextUrl.searchParams.get("before") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    return NextResponse.json(
      { error: "pass ?before=YYYY-MM-DD" },
      { status: 422 },
    );
  }

  const removed = await sql<{ date: string }>`
    delete from analytics_snapshots where date < ${before}::date returning date
  `;
  return NextResponse.json({ ok: true, removed: removed.length });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof Payload>;
  try {
    payload = Payload.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid payload", detail: err instanceof Error ? err.message : String(err) },
      { status: 422 },
    );
  }

  const client = await one<{ id: string; name: string }>`
    select id, name from clients
    where (${payload.clientId ?? null}::uuid is not null and id = ${payload.clientId ?? null}::uuid)
       or (${payload.slug ?? null}::text is not null and slug = ${payload.slug ?? null}::text)
       or (${payload.blogId ? String(payload.blogId) : null}::bigint is not null
           and metricool_blog_id = ${payload.blogId ? String(payload.blogId) : null}::bigint)
    limit 1
  `;

  if (!client) {
    return NextResponse.json(
      { error: "unknown client", hint: "pass blogId, slug, or clientId matching a row in clients" },
      { status: 404 },
    );
  }

  const [run] = await sql<{ id: string }>`
    insert into sync_runs (source, status) values (${payload.source}, 'running')
    returning id
  `;

  try {
    let written = 0;

    if (payload.snapshots.length > 0) {
      // One multi-row statement rather than N round trips. Placeholders are
      // generated here; every value is still bound, never interpolated.
      const values: unknown[] = [];
      const tuples = payload.snapshots.map((s) => {
        const i = values.length;
        values.push(client.id, s.network, s.metric, s.date, s.value);
        return `($${i + 1}::uuid, $${i + 2}, $${i + 3}, $${i + 4}::date, $${i + 5})`;
      });
      await query(
        `insert into analytics_snapshots (client_id, network, metric, date, value)
         values ${tuples.join(",")}
         on conflict (client_id, network, metric, date)
         do update set value = excluded.value, fetched_at = now()`,
        values,
      );
      written += payload.snapshots.length;
    }

    for (const p of payload.posts) {
      await sql`
        insert into analytics_posts
          (client_id, network, external_id, permalink, thumbnail_url, caption,
           published_at, metrics)
        values
          (${client.id}, ${p.network}, ${p.externalId}, ${p.permalink ?? null},
           ${p.thumbnailUrl ?? null}, ${p.caption ?? null},
           ${p.publishedAt ?? null}::timestamptz, ${JSON.stringify(p.metrics)}::jsonb)
        on conflict (client_id, network, external_id) do update set
          permalink     = excluded.permalink,
          thumbnail_url = excluded.thumbnail_url,
          caption       = excluded.caption,
          published_at  = excluded.published_at,
          metrics       = excluded.metrics,
          fetched_at    = now()
      `;
      written += 1;
    }

    await sql`
      update sync_runs
      set status = 'ok', finished_at = now(), rows_written = ${written}
      where id = ${run.id}
    `;

    return NextResponse.json({ ok: true, client: client.name, rowsWritten: written });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      update sync_runs set status = 'error', finished_at = now(), error = ${message}
      where id = ${run.id}
    `;
    return NextResponse.json({ error: "ingest failed", detail: message }, { status: 500 });
  }
}
