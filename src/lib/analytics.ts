import "server-only";

import { sql, one } from "./db";
import type { AnalyticsPost, SyncRun } from "./types";

/**
 * Canonical metric names. The sync agent maps whatever a provider calls things
 * onto these, so dashboards never branch on provider vocabulary.
 */
export const METRICS = {
  followers: "followers",
  reach: "reach",
  impressions: "impressions",
  engagement: "engagement",
  posts: "posts",
} as const;

export type SeriesPoint = { date: string } & Record<string, number | string>;

/**
 * A metric over time, pivoted into one column per network — the shape Recharts
 * wants for a multi-series line chart.
 */
export async function metricSeries(
  clientId: string,
  metric: string,
  days = 90,
): Promise<{ points: SeriesPoint[]; networks: string[] }> {
  const rows = await sql<{ date: string; network: string; value: number }>`
    select to_char(date, 'YYYY-MM-DD') as date, network, value
    from analytics_snapshots
    where client_id = ${clientId}
      and metric = ${metric}
      and date >= current_date - ${days}::integer
    order by date
  `;

  const byDate = new Map<string, SeriesPoint>();
  const networks = new Set<string>();

  for (const r of rows) {
    networks.add(r.network);
    const point = byDate.get(r.date) ?? { date: r.date };
    point[r.network] = Number(r.value);
    byDate.set(r.date, point);
  }

  return {
    points: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    networks: [...networks].sort(),
  };
}

export type Headline = {
  metric: string;
  latest: number;
  previous: number | null;
  /** Absolute change over the window. Null when there's nothing to compare to. */
  delta: number | null;
};

/**
 * Latest value vs the value `days` ago, summed across networks.
 *
 * Cumulative metrics (followers) take the most recent reading; flow metrics
 * (reach, engagement) are summed over the window. Treating them alike would
 * report nonsense for one or the other.
 */
export async function headline(
  clientId: string,
  metric: string,
  days = 30,
  kind: "cumulative" | "flow" = "cumulative",
): Promise<Headline | null> {
  if (kind === "cumulative") {
    const row = await one<{ latest: number | null; previous: number | null }>`
      with latest_per_network as (
        select distinct on (network) network, value
        from analytics_snapshots
        where client_id = ${clientId} and metric = ${metric}
        order by network, date desc
      ),
      prior_per_network as (
        select distinct on (network) network, value
        from analytics_snapshots
        where client_id = ${clientId} and metric = ${metric}
          and date <= current_date - ${days}::integer
        order by network, date desc
      )
      select (select sum(value) from latest_per_network) as latest,
             (select sum(value) from prior_per_network)  as previous
    `;
    if (!row || row.latest === null) return null;
    const latest = Number(row.latest);
    const previous = row.previous === null ? null : Number(row.previous);
    return { metric, latest, previous, delta: previous === null ? null : latest - previous };
  }

  const row = await one<{ latest: number | null; previous: number | null }>`
    select
      (select coalesce(sum(value), 0) from analytics_snapshots
        where client_id = ${clientId} and metric = ${metric}
          and date > current_date - ${days}::integer) as latest,
      (select coalesce(sum(value), 0) from analytics_snapshots
        where client_id = ${clientId} and metric = ${metric}
          and date > current_date - ${2 * days}::integer
          and date <= current_date - ${days}::integer) as previous
  `;
  if (!row) return null;
  const latest = Number(row.latest ?? 0);
  const previous = Number(row.previous ?? 0);
  if (latest === 0 && previous === 0) return null;
  return { metric, latest, previous, delta: latest - previous };
}

export async function topPosts(clientId: string, limit = 5): Promise<AnalyticsPost[]> {
  return sql<AnalyticsPost>`
    select * from analytics_posts
    where client_id = ${clientId}
    order by coalesce((metrics->>'engagement')::numeric, 0) desc nulls last,
             published_at desc nulls last
    limit ${limit}
  `;
}

/** Powers the honest "Synced 6h ago" stamp. */
export async function lastSync(): Promise<SyncRun | null> {
  return one<SyncRun>`
    select * from sync_runs where status = 'ok' order by started_at desc limit 1
  `;
}

export async function hasAnyAnalytics(clientId: string): Promise<boolean> {
  const row = await one<{ n: string }>`
    select count(*)::text as n from analytics_snapshots where client_id = ${clientId}
  `;
  return Number(row?.n ?? 0) > 0;
}
