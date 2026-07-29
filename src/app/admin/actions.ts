"use server";

/**
 * Admin mutations. Every one calls requireAdmin() first — these are not
 * reachable with a portal token, only with a staff session.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, one } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { newPortalToken, slugify } from "@/lib/tokens";
import { isValidTimezone } from "@/lib/timezones";
import { putObject, deleteObject } from "@/lib/storage";
import { resizeImage } from "@/lib/image";
import { getClientBySlug, UUID_RE } from "@/lib/queries";
import { notifyContentReady } from "@/lib/email";
import type { Client, ItemStatus } from "@/lib/types";

async function clientOr404(slug: string) {
  await requireAdmin();
  const client = await getClientBySlug(slug);
  if (!client) throw new Error(`no client with slug ${slug}`);
  return client;
}

function refresh(slug: string) {
  revalidatePath(`/admin/c/${slug}`, "layout");
  revalidatePath("/admin");
}

/**
 * How long to wait before a second "content ready" email may go out.
 *
 * Sending posts one at a time is the natural way to work, but it must not mean
 * one email per post. Inside this window the client already has a live link to
 * everything pending — the notification would carry no new information and
 * would train them to ignore the next one.
 */
const NOTIFY_COOLDOWN_MINUTES = 45;

/**
 * Tell the client there's something waiting, deep-linking to the first pending
 * item. A failure to send must never roll back the status change — the work is
 * shared either way, and Strive can always resend the link by hand.
 */
async function announcePending(client: Client) {
  try {
    const rows = await sql<{ id: string }>`
      select id from items
      where client_id = ${client.id} and status = 'in_review'
      order by scheduled_for nulls last, position, created_at
    `;
    if (rows.length === 0) return;

    const recent = await one<{ id: string }>`
      select id from notifications_log
      where client_id = ${client.id}
        and kind = 'content_ready'
        and created_at > now() - ${`${NOTIFY_COOLDOWN_MINUTES} minutes`}::interval
      limit 1
    `;
    if (recent) {
      console.log(
        `[notify] suppressed duplicate content-ready for ${client.name} (within ${NOTIFY_COOLDOWN_MINUTES}m)`,
      );
      return;
    }

    await notifyContentReady(client, rows.length, rows[0].id);
  } catch (err) {
    console.error("[notify] content-ready failed:", err);
  }
}

/**
 * Send a hand-picked set of posts in one action, producing one email.
 *
 * The explicit path for "these six, now" — the cooldown above is the safety net
 * for everything else.
 */
export async function sendSelectedForReview(
  slug: string,
  itemIds: string[],
): Promise<{ ok: boolean; sent: number; notified: boolean; error?: string }> {
  try {
    const client = await clientOr404(slug);
    const ids = itemIds.filter((id) => UUID_RE.test(id));
    if (ids.length === 0) return { ok: false, sent: 0, notified: false, error: "Nothing selected." };

    const moved = await sql<{ id: string }>`
      update items set status = 'in_review', updated_at = now()
      where client_id = ${client.id}
        and id = any(${ids}::uuid[])
        and status in ('draft', 'requested')
      returning id
    `;

    if (moved.length === 0) {
      return { ok: false, sent: 0, notified: false, error: "Those posts were already sent." };
    }

    const before = await one<{ id: string }>`
      select id from notifications_log
      where client_id = ${client.id} and kind = 'content_ready'
        and created_at > now() - ${`${NOTIFY_COOLDOWN_MINUTES} minutes`}::interval
      limit 1
    `;

    await announcePending(client);
    refresh(slug);

    return { ok: true, sent: moved.length, notified: !before };
  } catch (err) {
    return {
      ok: false,
      sent: 0,
      notified: false,
      error: err instanceof Error ? err.message : "Couldn't send.",
    };
  }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function createItem(slug: string, formData: FormData) {
  const client = await clientOr404(slug);
  const type = String(formData.get("type") ?? "post") === "asset" ? "asset" : "post";
  const month = String(formData.get("month") ?? "").trim();

  let calendarId: string | null = null;
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [cal] = await sql<{ id: string }>`
      insert into calendars (client_id, month, title)
      values (${client.id}, ${`${month}-01`}::date,
              to_char(${`${month}-01`}::date, 'FMMonth YYYY'))
      on conflict (client_id, month) do update set month = excluded.month
      returning id
    `;
    calendarId = cal.id;
  }

  const [item] = await sql<{ id: string }>`
    insert into items (client_id, calendar_id, type, title, caption, status)
    values (${client.id}, ${calendarId}, ${type}, ${String(formData.get("title") ?? "") || null},
            '', 'draft')
    returning id
  `;

  refresh(slug);
  redirect(`/admin/c/${slug}/i/${item.id}`);
}

/**
 * Create a blank post and hand back its id so the caller can open the composer
 * straight away. Defaults to noon — a time you'd plausibly post at, where
 * midnight reads as "not really scheduled".
 */
export async function quickCreate(
  slug: string,
  month: string,
): Promise<{ id: string } | { error: string }> {
  try {
    const client = await clientOr404(slug);

    const m = /^(\d{4})-(\d{2})$/.exec(month);
    const now = new Date();
    const year = m ? Number(m[1]) : now.getFullYear();
    const monthIdx = m ? Number(m[2]) - 1 : now.getMonth();

    // Land on today when creating in the current month, otherwise the 1st.
    const day =
      year === now.getFullYear() && monthIdx === now.getMonth() ? now.getDate() : 1;
    const mm = String(monthIdx + 1).padStart(2, "0");
    const when = `${year}-${mm}-${String(day).padStart(2, "0")}T12:00:00`;

    const [cal] = await sql<{ id: string }>`
      insert into calendars (client_id, month, title)
      values (${client.id}, ${`${year}-${mm}-01`}::date,
              to_char(${`${year}-${mm}-01`}::date, 'FMMonth YYYY'))
      on conflict (client_id, month) do update set month = excluded.month
      returning id
    `;

    const [item] = await sql<{ id: string }>`
      insert into items (client_id, calendar_id, type, caption, status, scheduled_for)
      values (${client.id}, ${cal.id}, 'post', '', 'draft', ${when}::timestamptz)
      returning id
    `;

    refresh(slug);
    return { id: item.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't create a post." };
  }
}

export type ComposerPayload = {
  title: string;
  caption: string;
  platforms: string[];
  hashtags: string[];
  labels: string[];
  format: string;
  pillarId: string | null;
  scheduledFor: string;
  status: ItemStatus;
  internalNote: string;
};

const FORMATS = new Set(["post", "video", "story", "reel", "carousel"]);

export async function saveItem(
  slug: string,
  itemId: string,
  values: ComposerPayload,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await clientOr404(slug);
    if (!UUID_RE.test(itemId)) return { ok: false, error: "Unknown post." };

    const before = await one<{ status: ItemStatus }>`
      select status from items where id = ${itemId} and client_id = ${client.id}
    `;
    if (!before) return { ok: false, error: "Unknown post." };

    await sql`
      update items set
        title         = ${values.title.trim() || null},
        caption       = ${values.caption},
        platforms     = ${values.platforms}::text[],
        hashtags      = ${values.hashtags}::text[],
        labels        = ${values.labels}::text[],
        format        = ${FORMATS.has(values.format) ? values.format : "post"},
        pillar_id     = ${values.pillarId && UUID_RE.test(values.pillarId) ? values.pillarId : null}::uuid,
        internal_note = ${values.internalNote.trim() || null},
        scheduled_for = ${values.scheduledFor || null}::timestamptz,
        status        = ${values.status},
        updated_at    = now()
      where id = ${itemId} and client_id = ${client.id}
    `;

    // Moving into review is what actually notifies the client, so it fires here
    // rather than on every save.
    if (values.status === "in_review" && before.status !== "in_review") {
      await announcePending(client);
    }

    refresh(slug);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save." };
  }
}

export async function setItemStatus(slug: string, itemId: string, status: ItemStatus) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(itemId)) throw new Error("bad item id");

  await sql`
    update items set status = ${status}, updated_at = now()
    where id = ${itemId} and client_id = ${client.id}
  `;

  // Approving on the client's behalf is a real workflow — clients say "looks
  // good!" in a DM all the time — but it must be labelled as such in the audit
  // log, never recorded as if the client clicked it themselves.
  if (status === "approved") {
    await sql`
      insert into approvals (client_id, item_id, decision, actor, actor_name, note)
      values (${client.id}, ${itemId}, 'approved', 'admin_on_behalf', 'Strive Media',
              'Marked approved by Strive Media on the client''s behalf')
    `;
  }

  if (status === "in_review") await announcePending(client);

  refresh(slug);
}

export async function sendForReview(slug: string, itemIds: string[]) {
  const client = await clientOr404(slug);
  const ids = itemIds.filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return;

  await sql`
    update items set status = 'in_review', updated_at = now()
    where client_id = ${client.id} and id = any(${ids}::uuid[]) and status = 'draft'
  `;
  await announcePending(client);
  refresh(slug);
}

export async function sendCalendarForReview(slug: string, calendarId: string) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(calendarId)) throw new Error("bad calendar id");

  await sql`
    update items set status = 'in_review', updated_at = now()
    where client_id = ${client.id} and calendar_id = ${calendarId} and status = 'draft'
  `;
  await sql`
    update calendars set status = 'in_review', sent_at = now()
    where id = ${calendarId} and client_id = ${client.id}
  `;
  await announcePending(client);
  refresh(slug);
}

/**
 * Copy a month's structure into the next one as drafts.
 *
 * Captions and titles carry over (agency months rhyme — same recurring slots,
 * same cadence); media, statuses, comments and approval history do not. The
 * copies land as drafts so nothing reaches a client until it's been rewritten.
 */
export async function duplicateMonth(slug: string, calendarId: string) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(calendarId)) throw new Error("bad calendar id");

  const source = await one<{ id: string; month: string }>`
    select id, to_char(month, 'YYYY-MM-DD') as month
    from calendars where id = ${calendarId} and client_id = ${client.id}
  `;
  if (!source) throw new Error("calendar not found");

  const [target] = await sql<{ id: string }>`
    insert into calendars (client_id, month, title, status)
    values (
      ${client.id},
      (${source.month}::date + interval '1 month')::date,
      to_char((${source.month}::date + interval '1 month')::date, 'FMMonth YYYY'),
      'draft'
    )
    on conflict (client_id, month) do update set month = excluded.month
    returning id
  `;

  await sql`
    insert into items
      (client_id, calendar_id, type, title, caption, platforms, labels,
       scheduled_for, status, position, internal_note)
    select
      client_id, ${target.id}, type, title, caption, platforms, labels,
      scheduled_for + interval '1 month', 'draft', position, internal_note
    from items
    where client_id = ${client.id} and calendar_id = ${source.id}
  `;

  refresh(slug);
  redirect(`/admin/c/${slug}`);
}

export async function deleteItem(slug: string, itemId: string) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(itemId)) throw new Error("bad item id");
  await sql`delete from items where id = ${itemId} and client_id = ${client.id}`;
  refresh(slug);
}

/** Copy a post as a fresh draft. Media, comments and history do not carry over. */
export async function duplicateItem(slug: string, itemId: string) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(itemId)) throw new Error("bad item id");

  await sql`
    insert into items
      (client_id, calendar_id, type, format, title, caption, platforms, labels,
       hashtags, pillar_id, scheduled_for, status, position, internal_note)
    select
      client_id, calendar_id, type, format,
      coalesce(title, '') || ' (copy)', caption, platforms, labels,
      hashtags, pillar_id, scheduled_for, 'draft', position, internal_note
    from items
    where id = ${itemId} and client_id = ${client.id}
  `;
  refresh(slug);
}

export async function addAdminComment(slug: string, itemId: string, body: string) {
  const client = await clientOr404(slug);
  const trimmed = body.trim();
  if (!trimmed || !UUID_RE.test(itemId)) return;

  const owned = await one<{ id: string }>`
    select id from items where id = ${itemId} and client_id = ${client.id}
  `;
  if (!owned) return;

  await sql`
    insert into comments (item_id, author_type, author_name, body)
    values (${itemId}, 'admin', 'Strive Media', ${trimmed})
  `;
  refresh(slug);
}

// ---------------------------------------------------------------------------
// Client management
// ---------------------------------------------------------------------------

/** Invalidates the old link immediately — use if a portal URL leaks. */
export async function rotatePortalToken(slug: string) {
  const client = await clientOr404(slug);
  await sql`
    update clients set portal_token = ${newPortalToken()} where id = ${client.id}
  `;
  refresh(slug);
}

export async function addContact(slug: string, formData: FormData) {
  const client = await clientOr404(slug);
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;

  await sql`
    insert into client_contacts (client_id, name, email)
    values (${client.id}, ${name || email.split("@")[0]}, ${email})
    on conflict (client_id, email) do update set name = excluded.name, notify = true
  `;
  refresh(slug);
}

export async function removeContact(slug: string, contactId: string) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(contactId)) return;
  await sql`
    delete from client_contacts where id = ${contactId} and client_id = ${client.id}
  `;
  refresh(slug);
}

/** Onboard a client: name is all that's required, everything else has a default. */
export async function createClient(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const base = slugify(name) || "client";
  // Slugs are unique and appear in admin URLs; suffix on collision rather than
  // failing the form in front of someone who just wanted to add a client.
  let slug = base;
  for (let n = 2; n < 50; n++) {
    const taken = await one<{ id: string }>`select id from clients where slug = ${slug}`;
    if (!taken) break;
    slug = `${base}-${n}`;
  }

  const [client] = await sql<{ slug: string }>`
    insert into clients (name, slug, timezone, brand_color, portal_token, metricool_blog_id)
    values (
      ${name}, ${slug},
      ${String(formData.get("timezone") ?? "America/New_York")},
      ${String(formData.get("brand_color") ?? "#1c1917")},
      ${newPortalToken()},
      ${String(formData.get("metricool_blog_id") ?? "").trim() || null}::bigint
    )
    returning slug
  `;

  revalidatePath("/admin", "layout");
  redirect(`/admin/c/${client.slug}/settings`);
}

/**
 * Change the timezone a client's schedule is expressed in.
 *
 * Stored times are absolute (timestamptz) — this changes how they're rendered,
 * for you and for them, not when anything actually publishes.
 */
export async function setClientTimezone(slug: string, timezone: string) {
  const client = await clientOr404(slug);
  if (!isValidTimezone(timezone)) return;
  await sql`update clients set timezone = ${timezone} where id = ${client.id}`;
  revalidatePath(`/admin/c/${slug}`, "layout");
  revalidatePath("/admin");
}

/** Per-network handles shown on post cards and in previews. */
export async function setClientHandles(slug: string, formData: FormData) {
  const client = await clientOr404(slug);

  const handles: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("handle_")) continue;
    const handle = String(value).trim().replace(/^@/, "");
    if (handle) handles[key.slice("handle_".length)] = handle;
  }

  await sql`
    update clients set handles = ${JSON.stringify(handles)}::jsonb
    where id = ${client.id}
  `;
  refresh(slug);
}

/**
 * Replace a client's logo.
 *
 * Normalised to a 256px WebP square on upload: logos arrive as 4000px PNGs and
 * this one image is rendered in the sidebar on every single page.
 */
export async function uploadLogo(slug: string, formData: FormData) {
  const client = await clientOr404(slug);

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return;
  if (!file.type.startsWith("image/")) return;
  if (file.size > 5 * 1024 * 1024) return;

  const input = Buffer.from(await file.arrayBuffer());
  const out = await resizeImage(input, 256, "contain", file.type, "png");

  const key = await putObject(
    `logos/${client.id}-${Date.now()}.${out.ext}`,
    out.body,
    out.contentType,
  );

  const previous = client.logo_path;
  await sql`update clients set logo_path = ${key} where id = ${client.id}`;
  if (previous) await deleteObject(previous).catch(() => {});

  revalidatePath("/admin", "layout");
  refresh(slug);
}

export async function removeLogo(slug: string) {
  const client = await clientOr404(slug);
  if (client.logo_path) await deleteObject(client.logo_path).catch(() => {});
  await sql`update clients set logo_path = null where id = ${client.id}`;
  revalidatePath("/admin", "layout");
  refresh(slug);
}

export async function renameClient(slug: string, name: string) {
  const client = await clientOr404(slug);
  const trimmed = name.trim();
  if (!trimmed) return;
  await sql`update clients set name = ${trimmed} where id = ${client.id}`;
  refresh(slug);
}
