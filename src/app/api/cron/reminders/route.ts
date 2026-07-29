/**
 * Reminder sweep. Driven by Vercel Cron (see vercel.json).
 *
 * Chases clients who still have content sitting unreviewed. The whole point of
 * the product is that Strive stops doing this by hand.
 *
 * Two guards keep it from becoming spam:
 *   - only content that has been waiting at least REMINDER_AFTER_DAYS
 *   - at most one reminder per client per REMINDER_COOLDOWN_DAYS, enforced via
 *     notifications_log rather than by hoping the cron fires exactly once
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { sql, one } from "@/lib/db";
import { notifyReminder } from "@/lib/email";
import type { Client } from "@/lib/types";

export const runtime = "nodejs";

const REMINDER_AFTER_DAYS = 3;
const REMINDER_COOLDOWN_DAYS = 3;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
  const presented = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const clients = await sql<Client>`select * from clients where archived_at is null`;
  const sent: string[] = [];
  const skipped: string[] = [];

  for (const client of clients) {
    const stale = await sql<{ id: string }>`
      select id from items
      where client_id = ${client.id}
        and status = 'in_review'
        and updated_at < now() - ${`${REMINDER_AFTER_DAYS} days`}::interval
      order by scheduled_for nulls last, position, created_at
    `;
    if (stale.length === 0) {
      skipped.push(`${client.name}: nothing stale`);
      continue;
    }

    const recent = await one<{ id: string }>`
      select id from notifications_log
      where client_id = ${client.id}
        and kind = 'reminder'
        and created_at > now() - ${`${REMINDER_COOLDOWN_DAYS} days`}::interval
      limit 1
    `;
    if (recent) {
      skipped.push(`${client.name}: reminded recently`);
      continue;
    }

    const ok = await notifyReminder(client, stale.length, stale[0].id);
    (ok ? sent : skipped).push(`${client.name}${ok ? "" : ": no contacts / send failed"}`);
  }

  return NextResponse.json({ ok: true, sent, skipped });
}
