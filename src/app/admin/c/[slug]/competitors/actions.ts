"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getClientBySlug, UUID_RE } from "@/lib/queries";

async function clientOr404(slug: string) {
  await requireAdmin();
  const client = await getClientBySlug(slug);
  if (!client) throw new Error(`no client with slug ${slug}`);
  return client;
}

function refresh(slug: string) {
  revalidatePath(`/admin/c/${slug}/competitors`);
}

export async function addCompetitor(slug: string, formData: FormData) {
  const client = await clientOr404(slug);

  const handle = String(formData.get("handle") ?? "")
    .trim()
    .replace(/^@/, "");
  const network = String(formData.get("network") ?? "instagram").trim();
  if (!handle) return;

  await sql`
    insert into competitors (client_id, network, handle, display_name, profile_url, notes)
    values (
      ${client.id}, ${network}, ${handle},
      ${String(formData.get("display_name") ?? "").trim() || null},
      ${String(formData.get("profile_url") ?? "").trim() || null},
      ${String(formData.get("notes") ?? "").trim() || null}
    )
    on conflict (client_id, network, handle) do update
      set display_name = excluded.display_name,
          profile_url  = excluded.profile_url,
          notes        = excluded.notes
  `;
  refresh(slug);
}

export async function removeCompetitor(slug: string, competitorId: string) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(competitorId)) return;
  await sql`
    delete from competitors where id = ${competitorId} and client_id = ${client.id}
  `;
  refresh(slug);
}

/**
 * Record a reading for a competitor on a given date.
 *
 * Keyed on (competitor_id, date), so re-entering a day corrects it rather than
 * duplicating — the same idempotency rule the Metricool ingest follows, which is
 * what lets an automated sync take this over later without a migration.
 */
export async function recordSnapshot(slug: string, formData: FormData) {
  const client = await clientOr404(slug);

  const competitorId = String(formData.get("competitor_id") ?? "");
  if (!UUID_RE.test(competitorId)) return;

  // Ownership check: the competitor must belong to this client.
  const owned = await sql<{ id: string }>`
    select id from competitors where id = ${competitorId} and client_id = ${client.id}
  `;
  if (owned.length === 0) return;

  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  const num = (key: string): number | null => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  await sql`
    insert into competitor_snapshots
      (competitor_id, date, followers, posts, likes, engagement, source)
    values
      (${competitorId}, ${date}::date, ${num("followers")}, ${num("posts")},
       ${num("likes")}, ${num("engagement")}, 'manual')
    on conflict (competitor_id, date) do update set
      followers  = excluded.followers,
      posts      = excluded.posts,
      likes      = excluded.likes,
      engagement = excluded.engagement,
      source     = 'manual'
  `;
  refresh(slug);
}
