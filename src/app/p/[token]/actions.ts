"use server";

/**
 * Client-portal mutations.
 *
 * Every action re-resolves the portal token server-side and scopes its writes to
 * the resulting client_id. Nothing trusts an id sent from the browser: passing
 * another client's item id simply matches zero rows.
 */

import { revalidatePath } from "next/cache";
import { sql, one } from "@/lib/db";
import { resolveClient, requestContext } from "@/lib/portal";
import { getClientVisibleItem } from "@/lib/queries";
import type { ItemStatus } from "@/lib/types";

export type ActionResult =
  | { ok: true; nextItemId: string | null; pendingLeft: number }
  | { ok: false; error: string };

async function scope(token: string) {
  const client = await resolveClient(token);
  if (!client) throw new Error("This link is no longer valid.");
  return client;
}

/** The next item still awaiting this client, in the order the portal lists them. */
async function nextPending(clientId: string, excludeId?: string): Promise<string | null> {
  const row = await one<{ id: string }>`
    select id from items
    where client_id = ${clientId}
      and status = 'in_review'
      and (${excludeId ?? null}::uuid is null or id <> ${excludeId ?? null}::uuid)
    order by scheduled_for nulls last, position, created_at
    limit 1
  `;
  return row?.id ?? null;
}

async function countPending(clientId: string): Promise<number> {
  const row = await one<{ n: string }>`
    select count(*)::text as n from items
    where client_id = ${clientId} and status = 'in_review'
  `;
  return Number(row?.n ?? 0);
}

function revalidate(token: string) {
  revalidatePath(`/p/${token}`, "layout");
}

async function setStatus(
  clientId: string,
  itemId: string,
  from: ItemStatus[],
  to: ItemStatus,
): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    update items set status = ${to}, updated_at = now()
    where id = ${itemId}
      and client_id = ${clientId}
      and status = any(${from}::text[])
    returning id
  `;
  return rows.length > 0;
}

// ---------------------------------------------------------------------------

export async function approveItem(token: string, itemId: string): Promise<ActionResult> {
  try {
    const client = await scope(token);
    const item = await getClientVisibleItem(client.id, itemId);
    if (!item) return { ok: false, error: "That post is no longer available." };

    // Idempotent: re-approving an already-approved item is a no-op, not an error.
    // Double-taps on a slow phone connection are common and must not break the flow.
    if (item.status === "in_review" || item.status === "changes_requested") {
      await setStatus(client.id, itemId, ["in_review", "changes_requested"], "approved");
      const { ip, userAgent } = await requestContext();
      await sql`
        insert into approvals (client_id, item_id, decision, actor, ip, user_agent)
        values (${client.id}, ${itemId}, 'approved', 'client', ${ip}, ${userAgent})
      `;
    }

    revalidate(token);
    return {
      ok: true,
      nextItemId: await nextPending(client.id, itemId),
      pendingLeft: await countPending(client.id),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/** Backs out an approval made by mistake. Paired with the Undo toast. */
export async function undoApproval(token: string, itemId: string): Promise<ActionResult> {
  try {
    const client = await scope(token);
    const reverted = await setStatus(client.id, itemId, ["approved"], "in_review");
    if (reverted) {
      const { ip, userAgent } = await requestContext();
      await sql`
        insert into approvals (client_id, item_id, decision, actor, ip, user_agent)
        values (${client.id}, ${itemId}, 'undone', 'client', ${ip}, ${userAgent})
      `;
    }
    revalidate(token);
    return { ok: true, nextItemId: itemId, pendingLeft: await countPending(client.id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function requestChanges(
  token: string,
  itemId: string,
  note: string,
): Promise<ActionResult> {
  const trimmed = note.trim();
  // The only place in the whole client flow where typing is mandatory — a
  // change request without a note is worthless to the person acting on it.
  if (trimmed.length < 2) {
    return { ok: false, error: "Let us know what to change." };
  }

  try {
    const client = await scope(token);
    const item = await getClientVisibleItem(client.id, itemId);
    if (!item) return { ok: false, error: "That post is no longer available." };

    await setStatus(client.id, itemId, ["in_review", "approved"], "changes_requested");
    const { ip, userAgent } = await requestContext();
    await sql`
      insert into approvals (client_id, item_id, decision, actor, note, ip, user_agent)
      values (${client.id}, ${itemId}, 'changes_requested', 'client', ${trimmed}, ${ip}, ${userAgent})
    `;
    await sql`
      insert into comments (item_id, author_type, author_name, body)
      values (${itemId}, 'client', ${client.name}, ${trimmed})
    `;

    // Best-effort: a mail failure must not make the client's change request
    // look like it failed. It is recorded in the database either way.
    try {
      const { notifyStaffChangesRequested } = await import("@/lib/email");
      await notifyStaffChangesRequested(client, item.title ?? "Untitled", trimmed);
    } catch (err) {
      console.error("[notify] staff changes-requested failed:", err);
    }

    revalidate(token);
    return {
      ok: true,
      nextItemId: await nextPending(client.id, itemId),
      pendingLeft: await countPending(client.id),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/** Optional commentary that doesn't change status. */
export async function addComment(
  token: string,
  itemId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Write something first." };
  try {
    const client = await scope(token);
    const item = await getClientVisibleItem(client.id, itemId);
    if (!item) return { ok: false, error: "That post is no longer available." };
    await sql`
      insert into comments (item_id, author_type, author_name, body)
      values (${itemId}, 'client', ${client.name}, ${trimmed})
    `;
    revalidate(token);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ---------------------------------------------------------------------------
// Client-authored post requests
// ---------------------------------------------------------------------------

/**
 * Start a blank request. Created immediately (rather than on first save) so the
 * client has a real item id to attach media to while they write.
 *
 * Status is forced to 'requested' and created_by to 'client'. Neither is taken
 * from the browser — a client must never be able to author something that is
 * already approved or scheduled.
 */
export async function startRequest(token: string): Promise<{ id: string } | { error: string }> {
  try {
    const client = await scope(token);
    const [row] = await sql<{ id: string }>`
      insert into items (client_id, type, title, caption, status, created_by)
      values (${client.id}, 'post', null, '', 'requested', 'client')
      returning id
    `;
    revalidate(token);
    return { id: row.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start a new post." };
  }
}

export type RequestPayload = {
  title: string;
  caption: string;
  platforms: string[];
  hashtags: string[];
  scheduledFor: string;
};

/** Save a client's own request. Scoped so they can only edit their own drafts. */
export async function saveRequest(
  token: string,
  itemId: string,
  values: RequestPayload,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await scope(token);

    const rows = await sql<{ id: string }>`
      update items set
        title         = ${values.title.trim() || null},
        caption       = ${values.caption},
        platforms     = ${values.platforms}::text[],
        hashtags      = ${values.hashtags}::text[],
        scheduled_for = ${values.scheduledFor || null}::timestamptz,
        updated_at    = now()
      where id = ${itemId}
        and client_id = ${client.id}
        and created_by = 'client'
        and status = 'requested'
      returning id
    `;

    if (rows.length === 0) {
      return { ok: false, error: "This post can no longer be edited." };
    }

    revalidate(token);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save." };
  }
}

/** Discard an untouched request so abandoned blanks don't pile up. */
export async function discardRequest(
  token: string,
  itemId: string,
): Promise<{ ok: boolean }> {
  try {
    const client = await scope(token);
    await sql`
      delete from items
      where id = ${itemId} and client_id = ${client.id}
        and created_by = 'client' and status = 'requested'
    `;
    revalidate(token);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** "Approve all remaining" — for clients who'd rather sign off a month at once. */
export async function approveAll(
  token: string,
  calendarId?: string,
): Promise<ActionResult> {
  try {
    const client = await scope(token);

    const approved = calendarId
      ? await sql<{ id: string }>`
          update items set status = 'approved', updated_at = now()
          where client_id = ${client.id} and calendar_id = ${calendarId}
            and status = 'in_review'
          returning id
        `
      : await sql<{ id: string }>`
          update items set status = 'approved', updated_at = now()
          where client_id = ${client.id} and status = 'in_review'
          returning id
        `;

    const { ip, userAgent } = await requestContext();
    for (const row of approved) {
      await sql`
        insert into approvals (client_id, item_id, calendar_id, decision, actor, ip, user_agent)
        values (${client.id}, ${row.id}, ${calendarId ?? null}, 'approved', 'client', ${ip}, ${userAgent})
      `;
    }

    if (calendarId) {
      await sql`
        update calendars set status = 'approved', approved_at = now()
        where id = ${calendarId} and client_id = ${client.id}
          and not exists (
            select 1 from items
            where calendar_id = ${calendarId} and status in ('in_review','changes_requested')
          )
      `;
    }

    revalidate(token);
    return { ok: true, nextItemId: null, pendingLeft: await countPending(client.id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
