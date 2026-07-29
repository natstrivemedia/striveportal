import "server-only";

import { sql } from "./db";
import type { ItemStatus } from "./types";

/** Anything sitting with the client for longer than this is chased on Home. */
export const STALE_AFTER_DAYS = 2;

export type DashRow = {
  id: string;
  title: string | null;
  caption: string;
  status: ItemStatus;
  scheduled_for: Date | null;
  updated_at: Date;
  platforms: string[];
  client_name: string;
  client_slug: string;
  brand_color: string;
  timezone: string;
};

/**
 * Work that has stalled — sent to a client and not acted on.
 *
 * This is the single most useful thing to see first: it is the only category
 * where nothing happens unless somebody chases it.
 */
export async function staleItems(): Promise<DashRow[]> {
  return sql<DashRow>`
    select i.id, i.title, i.caption, i.status, i.scheduled_for, i.updated_at,
           i.platforms, c.name as client_name, c.slug as client_slug,
           c.brand_color, c.timezone
    from items i
    join clients c on c.id = i.client_id
    where c.archived_at is null
      and i.status in ('in_review', 'requested')
      and i.updated_at < now() - ${`${STALE_AFTER_DAYS} days`}::interval
    order by i.updated_at
    limit 8
  `;
}

export type StatusCounts = Record<string, number> & { total: number };

/** This calendar month's pipeline, by status. */
export async function contentStatus(): Promise<StatusCounts> {
  const rows = await sql<{ status: ItemStatus; n: string }>`
    select i.status, count(*)::text as n
    from items i
    join clients c on c.id = i.client_id
    where c.archived_at is null
      and i.created_at >= date_trunc('month', now())
    group by i.status
  `;

  const counts: StatusCounts = { total: 0 } as StatusCounts;
  for (const r of rows) {
    counts[r.status] = Number(r.n);
    counts.total += Number(r.n);
  }
  return counts;
}

/** What's actually going out, soonest first. */
export async function upcomingContent(): Promise<DashRow[]> {
  return sql<DashRow>`
    select i.id, i.title, i.caption, i.status, i.scheduled_for, i.updated_at,
           i.platforms, c.name as client_name, c.slug as client_slug,
           c.brand_color, c.timezone
    from items i
    join clients c on c.id = i.client_id
    where c.archived_at is null
      and i.status in ('approved', 'scheduled')
      and i.scheduled_for is not null
      and i.scheduled_for >= now()
    order by i.scheduled_for
    limit 8
  `;
}

/** "Good morning/afternoon/evening", computed in the workspace's own timezone. */
export function greeting(timeZone: string, now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
