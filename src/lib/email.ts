/**
 * Transactional email.
 *
 * Without RESEND_API_KEY this logs instead of sending, so the whole approval
 * flow is developable and testable before any domain is verified — and a
 * missing key can never silently swallow a notification in production, because
 * production is where the key exists.
 *
 * The one design rule: the button in the email deep-links to the FIRST PENDING
 * ITEM, never to a dashboard. Landing a client on an index they have to
 * navigate is where most approval tools lose them.
 */
import "server-only";

import { sql } from "./db";
import { portalUrl } from "./portal";
import { plural } from "./utils";
import type { Client } from "./types";

const FROM = process.env.MAIL_FROM ?? "Strive Media <onboarding@resend.dev>";

type SendArgs = { to: string[]; subject: string; html: string; text: string };

async function deliver({ to, subject, html, text }: SendArgs): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    console.log(
      `\n[email:dev] would send to ${to.join(", ")}\n  subject: ${subject}\n  ${text.replace(/\n/g, "\n  ")}\n`,
    );
    return true;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(key);
    const { error } = await resend.emails.send({ from: FROM, to, subject, html, text });
    if (error) {
      console.error("[email] send failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send threw:", err);
    return false;
  }
}

async function recipients(clientId: string): Promise<string[]> {
  const rows = await sql<{ email: string }>`
    select email from client_contacts where client_id = ${clientId} and notify = true
  `;
  return rows.map((r) => r.email);
}

function shell(body: string, cta: { href: string; label: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fafaf9;font-family:-apple-system,Segoe UI,sans-serif;color:#1c1917">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:24px">
    ${body}
    <a href="${cta.href}" style="display:inline-block;margin-top:20px;background:#0c0a09;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600">${cta.label}</a>
    <p style="margin-top:20px;font-size:12px;color:#a8a29e">No login needed — this link is yours.</p>
  </div></body></html>`;
}

/** Sent when work moves from draft to in_review. */
export async function notifyContentReady(
  client: Client,
  pendingCount: number,
  firstPendingItemId: string | null,
): Promise<boolean> {
  const to = await recipients(client.id);
  if (to.length === 0) return false;

  const href = firstPendingItemId
    ? portalUrl(client.portal_token, `/i/${firstPendingItemId}`)
    : portalUrl(client.portal_token);

  const subject = `${plural(pendingCount, "post")} ready for you — ${client.name}`;
  const text = `${plural(pendingCount, "post")} ready to review.\nOne tap each: ${href}`;

  const sent = await deliver({
    to,
    subject,
    text,
    html: shell(
      `<h1 style="margin:0 0 8px;font-size:20px">${plural(pendingCount, "post")} ready for you</h1>
       <p style="margin:0;color:#57534e;font-size:15px;line-height:1.5">Approve with one tap. You can undo straight after, and add a note if something needs changing.</p>`,
      { href, label: "Review now" },
    ),
  });

  if (sent) {
    await sql`
      insert into notifications_log (client_id, kind, target_id, sent_to)
      values (${client.id}, 'content_ready', ${firstPendingItemId}, ${to.join(",")})
    `;
  }
  return sent;
}

/** Nudge for content still sitting unreviewed. Deduped by notifications_log. */
export async function notifyReminder(
  client: Client,
  pendingCount: number,
  firstPendingItemId: string | null,
): Promise<boolean> {
  const to = await recipients(client.id);
  if (to.length === 0) return false;

  const href = firstPendingItemId
    ? portalUrl(client.portal_token, `/i/${firstPendingItemId}`)
    : portalUrl(client.portal_token);

  const sent = await deliver({
    to,
    subject: `Still waiting on ${plural(pendingCount, "post")} — ${client.name}`,
    text: `A quick nudge: ${plural(pendingCount, "post")} still need your OK.\n${href}`,
    html: shell(
      `<h1 style="margin:0 0 8px;font-size:20px">A quick nudge</h1>
       <p style="margin:0;color:#57534e;font-size:15px;line-height:1.5">${plural(pendingCount, "post")} still waiting on your OK. It takes about ten seconds.</p>`,
      { href, label: "Review now" },
    ),
  });

  if (sent) {
    await sql`
      insert into notifications_log (client_id, kind, target_id, sent_to)
      values (${client.id}, 'reminder', ${firstPendingItemId}, ${to.join(",")})
    `;
  }
  return sent;
}

/** Internal alert — a client asked for changes. */
export async function notifyStaffChangesRequested(
  client: Client,
  itemTitle: string,
  note: string,
): Promise<boolean> {
  const to = (process.env.STAFF_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) return false;

  return deliver({
    to,
    subject: `${client.name} asked for changes — ${itemTitle}`,
    text: `${client.name} requested changes on "${itemTitle}":\n\n${note}`,
    html: shell(
      `<h1 style="margin:0 0 8px;font-size:20px">${client.name} asked for changes</h1>
       <p style="margin:0 0 8px;font-weight:600">${itemTitle}</p>
       <p style="margin:0;color:#57534e;font-size:15px;line-height:1.5;white-space:pre-wrap">${note}</p>`,
      { href: `${process.env.APP_URL ?? ""}/admin`, label: "Open admin" },
    ),
  });
}
