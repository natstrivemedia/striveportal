"use server";

import { revalidatePath } from "next/cache";
import { sql, one } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getClientBySlug, UUID_RE } from "@/lib/queries";

async function clientOr404(slug: string) {
  await requireAdmin();
  const client = await getClientBySlug(slug);
  if (!client) throw new Error(`no client with slug ${slug}`);
  return client;
}

function refresh(slug: string) {
  revalidatePath(`/admin/c/${slug}`, "layout");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Move a post to another day, preserving its time of day.
 *
 * Dragging changes *when* something publishes, not what time it publishes at —
 * a 9am post dropped on Friday should still be a 9am post. The stored value is
 * absolute, so the shift is computed in the client's timezone to land on the
 * day they actually see.
 */
export async function reschedule(
  slug: string,
  itemId: string,
  isoDate: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await clientOr404(slug);
    if (!UUID_RE.test(itemId) || !ISO_DATE.test(isoDate)) {
      return { ok: false, error: "Bad target." };
    }

    const rows = await sql<{ id: string }>`
      update items
      set scheduled_for = (
            -- Keep the local clock time, change only the calendar day.
            (${isoDate}::date
              + (scheduled_for at time zone ${client.timezone})::time)
            at time zone ${client.timezone}
          ),
          updated_at = now()
      where id = ${itemId}
        and client_id = ${client.id}
        and scheduled_for is not null
      returning id
    `;

    if (rows.length === 0) {
      // Unscheduled posts have no time to preserve — give them noon.
      await sql`
        update items
        set scheduled_for = ((${isoDate} || ' 12:00')::timestamp
                              at time zone ${client.timezone}),
            updated_at = now()
        where id = ${itemId} and client_id = ${client.id}
      `;
    }

    refresh(slug);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't move it." };
  }
}

/** Create a post already dated to the cell it was created from. */
export async function createPostOnDate(
  slug: string,
  isoDate: string,
): Promise<{ id: string } | { error: string }> {
  try {
    const client = await clientOr404(slug);
    if (!ISO_DATE.test(isoDate)) return { error: "Bad date." };

    const month = `${isoDate.slice(0, 7)}-01`;
    const [cal] = await sql<{ id: string }>`
      insert into calendars (client_id, month, title)
      values (${client.id}, ${month}::date, to_char(${month}::date, 'FMMonth YYYY'))
      on conflict (client_id, month) do update set month = excluded.month
      returning id
    `;

    const [item] = await sql<{ id: string }>`
      insert into items (client_id, calendar_id, type, caption, status, scheduled_for)
      values (
        ${client.id}, ${cal.id}, 'post', '', 'draft',
        ((${isoDate} || ' 12:00')::timestamp at time zone ${client.timezone})
      )
      returning id
    `;

    refresh(slug);
    return { id: item.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't create a post." };
  }
}

/** Capture an idea from a calendar cell. Ideas are undated by nature. */
export async function createIdeaFromCalendar(
  slug: string,
  values: { title: string; notes: string; labels: string[] },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await clientOr404(slug);
    if (!values.title.trim()) return { ok: false, error: "Give it a title." };

    await sql`
      insert into ideas (client_id, title, notes, hashtags, source)
      values (${client.id}, ${values.title.trim()}, ${values.notes},
              ${values.labels}::text[], 'admin')
    `;
    refresh(slug);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save." };
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function createEvent(
  slug: string,
  values: { title: string; color: string; startsOn: string; endsOn: string; notes: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await clientOr404(slug);
    if (!values.title.trim()) return { ok: false, error: "Give the event a title." };
    if (!ISO_DATE.test(values.startsOn)) return { ok: false, error: "Pick a start date." };

    const ends = ISO_DATE.test(values.endsOn) ? values.endsOn : null;
    if (ends && ends < values.startsOn) {
      return { ok: false, error: "The end date is before the start date." };
    }

    const color = /^#[0-9a-f]{6}$/i.test(values.color) ? values.color : "#a3a19b";

    await sql`
      insert into calendar_events (client_id, title, notes, color, starts_on, ends_on)
      values (${client.id}, ${values.title.trim()}, ${values.notes}, ${color},
              ${values.startsOn}::date, ${ends}::date)
    `;
    refresh(slug);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save." };
  }
}

export async function updateEvent(
  slug: string,
  eventId: string,
  values: { title: string; color: string; startsOn: string; endsOn: string; notes: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await clientOr404(slug);
    if (!UUID_RE.test(eventId)) return { ok: false, error: "Unknown event." };
    if (!values.title.trim()) return { ok: false, error: "Give the event a title." };
    if (!ISO_DATE.test(values.startsOn)) return { ok: false, error: "Pick a start date." };

    const ends = ISO_DATE.test(values.endsOn) ? values.endsOn : null;
    if (ends && ends < values.startsOn) {
      return { ok: false, error: "The end date is before the start date." };
    }

    const color = /^#[0-9a-f]{6}$/i.test(values.color) ? values.color : "#a3a19b";

    await sql`
      update calendar_events
      set title = ${values.title.trim()}, notes = ${values.notes}, color = ${color},
          starts_on = ${values.startsOn}::date, ends_on = ${ends}::date
      where id = ${eventId} and client_id = ${client.id}
    `;
    refresh(slug);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save." };
  }
}

export async function deleteEvent(slug: string, eventId: string) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(eventId)) return;
  await sql`
    delete from calendar_events where id = ${eventId} and client_id = ${client.id}
  `;
  refresh(slug);
}

// ---------------------------------------------------------------------------
// Per-channel captions
// ---------------------------------------------------------------------------

/** Absent row = "use the master caption", so this is safe to call for any platform. */
export async function saveVariant(
  slug: string,
  itemId: string,
  platform: string,
  caption: string,
  hashtags: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await clientOr404(slug);
    if (!UUID_RE.test(itemId)) return { ok: false, error: "Unknown post." };

    const owned = await one<{ id: string }>`
      select id from items where id = ${itemId} and client_id = ${client.id}
    `;
    if (!owned) return { ok: false, error: "Unknown post." };

    if (!caption.trim() && hashtags.length === 0) {
      // Emptying a variant means "fall back to the master" — delete, don't
      // store a blank that would publish as an empty caption.
      await sql`
        delete from item_variants where item_id = ${itemId} and platform = ${platform}
      `;
    } else {
      await sql`
        insert into item_variants (item_id, platform, caption, hashtags, updated_at)
        values (${itemId}, ${platform}, ${caption}, ${hashtags}::text[], now())
        on conflict (item_id, platform) do update set
          caption = excluded.caption,
          hashtags = excluded.hashtags,
          updated_at = now()
      `;
    }

    refresh(slug);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save." };
  }
}
