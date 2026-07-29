/**
 * Data access. Every function that reads client-owned rows takes a clientId and
 * filters on it — that filter is the isolation boundary between portals.
 *
 * The item-with-media SELECT is written out in full in each function rather than
 * assembled from shared string fragments. Slightly repetitive, but the `sql`
 * tagged template turns every interpolation into a bound parameter by design,
 * and these are exactly the queries where that guarantee should not have an
 * escape hatch built next to it.
 */
import "server-only";

import { sql, one } from "./db";
import {
  CLIENT_VISIBLE_STATUSES,
  type Calendar,
  type Client,
  type Comment,
  type Item,
  type ItemMedia,
  type ItemWithMedia,
} from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** json_agg comes back parsed on PGlite, and as text on some drivers. */
function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hydrate(row: Record<string, unknown>): ItemWithMedia {
  const { media, ...item } = row;
  return { ...(item as unknown as Item), media: asArray<ItemMedia>(media) };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function listClients(): Promise<Client[]> {
  return sql<Client>`select * from clients where archived_at is null order by name`;
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  return one<Client>`select * from clients where slug = ${slug}`;
}

export async function getClientById(id: string): Promise<Client | null> {
  if (!UUID_RE.test(id)) return null;
  return one<Client>`select * from clients where id = ${id}`;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Everything the client may see. Drafts and internal notes never appear here. */
export async function listClientVisibleItems(clientId: string): Promise<ItemWithMedia[]> {
  const rows = await sql<Record<string, unknown>>`
    select i.*,
           coalesce(json_agg(m.* order by m.position, m.created_at)
                      filter (where m.id is not null), '[]') as media
    from items i
    left join item_media m on m.item_id = i.id
    where i.client_id = ${clientId}
      and i.status = any(${CLIENT_VISIBLE_STATUSES}::text[])
    group by i.id
    order by i.scheduled_for nulls last, i.position, i.created_at
  `;
  return rows.map(hydrate);
}

/** Admin view: everything, drafts included. */
export async function listAllItems(clientId: string): Promise<ItemWithMedia[]> {
  const rows = await sql<Record<string, unknown>>`
    select i.*,
           coalesce(json_agg(m.* order by m.position, m.created_at)
                      filter (where m.id is not null), '[]') as media
    from items i
    left join item_media m on m.item_id = i.id
    where i.client_id = ${clientId}
    group by i.id
    order by i.scheduled_for nulls last, i.position, i.created_at
  `;
  return rows.map(hydrate);
}

export async function listItemsInCalendar(
  clientId: string,
  calendarId: string,
): Promise<ItemWithMedia[]> {
  if (!UUID_RE.test(calendarId)) return [];
  const rows = await sql<Record<string, unknown>>`
    select i.*,
           coalesce(json_agg(m.* order by m.position, m.created_at)
                      filter (where m.id is not null), '[]') as media
    from items i
    left join item_media m on m.item_id = i.id
    where i.client_id = ${clientId} and i.calendar_id = ${calendarId}
    group by i.id
    order by i.scheduled_for nulls last, i.position, i.created_at
  `;
  return rows.map(hydrate);
}

/**
 * One item, scoped to a client. Returns null for another client's id so callers
 * can turn it into a 404 — never a 403, which would confirm the row exists.
 */
export async function getItem(
  clientId: string,
  itemId: string,
): Promise<ItemWithMedia | null> {
  if (!UUID_RE.test(itemId)) return null;
  const row = await one<Record<string, unknown>>`
    select i.*,
           coalesce(json_agg(m.* order by m.position, m.created_at)
                      filter (where m.id is not null), '[]') as media
    from items i
    left join item_media m on m.item_id = i.id
    where i.client_id = ${clientId} and i.id = ${itemId}
    group by i.id
  `;
  return row ? hydrate(row) : null;
}

/** Same as getItem but additionally hides anything still in draft. */
export async function getClientVisibleItem(
  clientId: string,
  itemId: string,
): Promise<ItemWithMedia | null> {
  const item = await getItem(clientId, itemId);
  if (!item) return null;
  return CLIENT_VISIBLE_STATUSES.includes(item.status) ? item : null;
}

export async function listComments(itemId: string): Promise<Comment[]> {
  if (!UUID_RE.test(itemId)) return [];
  return sql<Comment>`
    select * from comments where item_id = ${itemId} order by created_at
  `;
}

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

export type CalendarWithCounts = Calendar & {
  total: number;
  pending: number;
  approved: number;
  changes: number;
};

function countsFrom(row: Record<string, unknown>): CalendarWithCounts {
  return {
    ...(row as unknown as Calendar),
    total: Number(row.total),
    pending: Number(row.pending),
    approved: Number(row.approved),
    changes: Number(row.changes),
  };
}

export async function listCalendars(clientId: string): Promise<CalendarWithCounts[]> {
  const rows = await sql<Record<string, unknown>>`
    select c.*,
           to_char(c.month, 'YYYY-MM-DD')                            as month,
           count(i.id)                                              as total,
           count(i.id) filter (where i.status = 'in_review')         as pending,
           count(i.id) filter (where i.status = 'approved')          as approved,
           count(i.id) filter (where i.status = 'changes_requested') as changes
    from calendars c
    left join items i on i.calendar_id = c.id
    where c.client_id = ${clientId}
    group by c.id
    order by c.month desc
  `;
  return rows.map(countsFrom);
}

export async function getCalendar(
  clientId: string,
  calendarId: string,
): Promise<Calendar | null> {
  if (!UUID_RE.test(calendarId)) return null;
  // month is normalised to a 'YYYY-MM-DD' string here: drivers hand back a
  // Date for `date` columns, and re-deriving a calendar month from a Date
  // silently shifts it across a timezone boundary.
  return one<Calendar>`
    select *, to_char(month, 'YYYY-MM-DD') as month
    from calendars where id = ${calendarId} and client_id = ${clientId}
  `;
}

/** Drives the "N waiting on you" badge across admin and portal. */
export async function pendingCount(clientId: string): Promise<number> {
  const row = await one<{ n: string }>`
    select count(*)::text as n from items
    where client_id = ${clientId} and status = 'in_review'
  `;
  return Number(row?.n ?? 0);
}

export { CLIENT_VISIBLE_STATUSES, UUID_RE };
