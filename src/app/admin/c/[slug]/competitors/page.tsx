import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetitorIcon } from "@/components/icons";
import { sql } from "@/lib/db";
import { getClientBySlug } from "@/lib/queries";
import { headline, METRICS } from "@/lib/analytics";
import { addCompetitor, recordSnapshot, removeCompetitor } from "./actions";
import { EmptyState } from "@/components/ui";
import { networkLabel } from "@/components/charts/palette";
import { formatDate, formatNumber, plural } from "@/lib/utils";
import { PLATFORMS } from "@/lib/types";

type Row = {
  id: string;
  network: string;
  handle: string;
  display_name: string | null;
  profile_url: string | null;
  notes: string | null;
  followers: number | null;
  posts: number | null;
  likes: number | null;
  engagement: number | null;
  last_date: string | null;
  reading_count: string;
  prev_followers: number | null;
};

export default async function CompetitorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  // Latest reading per competitor, plus the one before it for a delta.
  const rows = await sql<Row>`
    select c.id, c.network, c.handle, c.display_name, c.profile_url, c.notes,
           latest.followers, latest.posts, latest.likes, latest.engagement,
           to_char(latest.date, 'YYYY-MM-DD') as last_date,
           (select count(*)::text from competitor_snapshots s where s.competitor_id = c.id)
             as reading_count,
           prev.followers as prev_followers
    from competitors c
    left join lateral (
      select * from competitor_snapshots s
      where s.competitor_id = c.id order by s.date desc limit 1
    ) latest on true
    left join lateral (
      select * from competitor_snapshots s
      where s.competitor_id = c.id order by s.date desc offset 1 limit 1
    ) prev on true
    where c.client_id = ${client.id}
    order by latest.followers desc nulls last, c.handle
  `;

  const own = await headline(client.id, METRICS.followers, 30, "cumulative");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div
      className="mx-auto max-w-5xl"
      style={{ "--brand": client.brand_color } as React.CSSProperties}
    >
      <div className="mb-6">
        <Link href={`/admin/c/${slug}`} className="text-small text-ink-500 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-h1 font-bold text-ink-900">
          Competitor analysis
        </h1>
        <p className="mt-1 text-body text-ink-500">
          Entered by hand. Metricool can supply this automatically once competitors are
          configured on the brand — the table below fills from the same store either way.
        </p>
      </div>

      {own && (
        <div className="mb-6 rounded-[20px] border border-ink-200 bg-white p-4 shadow-lift">
          <p className="text-small font-medium text-ink-500">
            {client.name} — followers, all networks
          </p>
          <p className="mt-1 text-h1 font-bold text-ink-900">
            {formatNumber(own.latest)}
          </p>
        </div>
      )}

      <form
        action={addCompetitor.bind(null, slug)}
        className="mb-8 flex flex-wrap items-end gap-2 rounded-[20px] border border-ink-200 bg-white p-4 shadow-lift"
      >
        <label>
          <span className="mb-1 block text-small font-medium text-ink-500">Network</span>
          <select
            name="network"
            className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {networkLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[160px] flex-1">
          <span className="mb-1 block text-small font-medium text-ink-500">Handle</span>
          <input
            name="handle"
            required
            placeholder="@theircompany"
            className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
        </label>
        <label className="min-w-[160px] flex-1">
          <span className="mb-1 block text-small font-medium text-ink-500">
            Name <span className="text-ink-400">(optional)</span>
          </span>
          <input
            name="display_name"
            className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
        </label>
        <button
          type="submit"
          className="cta bg-ink-950 text-white transition active:scale-[0.98]"
        >
          Track
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CompetitorIcon size={30} />}
          title="No competitors tracked yet"
          body="Add a handle above, then log their numbers whenever you check in. Monthly is plenty."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const delta =
              r.followers != null && r.prev_followers != null
                ? r.followers - r.prev_followers
                : null;
            return (
              <li
                key={r.id}
                className="rounded-[20px] border border-ink-200 bg-white p-4 shadow-lift"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      {r.display_name ?? `@${r.handle}`}
                      <span className="ml-2 rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-500">
                        {networkLabel(r.network)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-small text-ink-500">
                      @{r.handle} ·{" "}
                      {/* Readings are date-only. Showing a relative time would
                          invent an hour that was never recorded. */}
                      {r.last_date
                        ? `last logged ${r.last_date === today ? "today" : formatDate(`${r.last_date}T00:00:00`, { month: "short", day: "numeric" })} · ${plural(Number(r.reading_count), "reading")}`
                        : "no readings yet"}
                    </p>
                  </div>
                  <form action={removeCompetitor.bind(null, slug, r.id)}>
                    <button
                      type="submit"
                      className="rounded-full px-3 py-1.5 text-small font-semibold text-ink-400 transition hover:bg-stop-100 hover:text-stop-600"
                    >
                      Remove
                    </button>
                  </form>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-ink-100 pt-3 sm:grid-cols-4">
                  <Metric
                    label="Followers"
                    value={r.followers}
                    delta={delta}
                    compareTo={own?.latest}
                  />
                  <Metric label="Posts" value={r.posts} />
                  <Metric label="Avg likes" value={r.likes} />
                  {/* Engagement rates live in the decimals — 1.4% and 1.0% are
                      a meaningful gap that rounding to "1%" would erase. */}
                  <Metric label="Engagement" value={r.engagement} suffix="%" decimals={1} />
                </dl>

                <form
                  action={recordSnapshot.bind(null, slug)}
                  className="mt-3 flex flex-wrap items-end gap-2 border-t border-ink-100 pt-3"
                >
                  <input type="hidden" name="competitor_id" value={r.id} />
                  <MiniField name="date" label="Date" type="date" defaultValue={today} />
                  <MiniField name="followers" label="Followers" />
                  <MiniField name="posts" label="Posts" />
                  <MiniField name="likes" label="Avg likes" />
                  <MiniField name="engagement" label="Eng %" />
                  <button
                    type="submit"
                    className="cta border border-ink-200 text-ink-700 transition hover:bg-ink-100"
                  >
                    Log reading
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  delta,
  suffix,
  compareTo,
  decimals,
}: {
  label: string;
  value: number | null;
  delta?: number | null;
  suffix?: string;
  compareTo?: number;
  decimals?: number;
}) {
  const shown =
    value == null
      ? null
      : decimals != null
        ? value.toFixed(decimals)
        : formatNumber(value);

  return (
    <div>
      <dt className="text-small text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-h2 font-bold tabular-nums text-ink-900">
        {shown ?? <span className="text-ink-300">—</span>}
        {value != null && suffix}
        {delta != null && delta !== 0 && (
          <span
            className={
              delta > 0
                ? "ml-1.5 text-small font-semibold text-ok-600"
                : "ml-1.5 text-small font-semibold text-stop-600"
            }
          >
            {delta > 0 ? "▲" : "▼"} {formatNumber(Math.abs(delta))}
          </span>
        )}
      </dd>
      {compareTo != null && value != null && (
        <p className="mt-0.5 text-[11px] text-ink-400">
          {value > compareTo
            ? `${formatNumber(value - compareTo)} ahead of us`
            : `${formatNumber(compareTo - value)} behind us`}
        </p>
      )}
    </div>
  );
}

function MiniField({
  name,
  label,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-0.5 block text-[10px] font-medium uppercase text-ink-400">
        {label}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        inputMode={type === "text" ? "decimal" : undefined}
        className="w-24 rounded-lg border border-ink-200 bg-ink-50 px-2 py-1.5 text-body outline-none focus:border-ink-900 focus:bg-white"
      />
    </label>
  );
}
