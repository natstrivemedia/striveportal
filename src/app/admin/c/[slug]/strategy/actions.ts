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
  revalidatePath(`/admin/c/${slug}`, "layout");
}

// ---------------------------------------------------------------------------
// Content pillars
// ---------------------------------------------------------------------------

export async function addPillar(slug: string, formData: FormData) {
  const client = await clientOr404(slug);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const [{ next }] = await sql<{ next: number }>`
    select coalesce(max(position) + 1, 0) as next
    from content_pillars where client_id = ${client.id}
  `;

  await sql`
    insert into content_pillars (client_id, name, description, color, position)
    values (
      ${client.id}, ${name},
      ${String(formData.get("description") ?? "").trim() || null},
      ${String(formData.get("color") ?? "#78716c")},
      ${Number(next)}
    )
    on conflict (client_id, name) do update set
      description = excluded.description,
      color       = excluded.color,
      archived_at = null
  `;
  refresh(slug);
}

/** Archive rather than delete — posts keep the pillar they were filed under. */
export async function archivePillar(slug: string, pillarId: string) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(pillarId)) return;
  await sql`
    update content_pillars set archived_at = now()
    where id = ${pillarId} and client_id = ${client.id}
  `;
  refresh(slug);
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export async function saveStrategy(slug: string, formData: FormData) {
  const client = await clientOr404(slug);
  await sql`
    insert into client_strategy (client_id, positioning, audience, voice, notes, updated_at)
    values (
      ${client.id},
      ${String(formData.get("positioning") ?? "")},
      ${String(formData.get("audience") ?? "")},
      ${String(formData.get("voice") ?? "")},
      ${String(formData.get("notes") ?? "")},
      now()
    )
    on conflict (client_id) do update set
      positioning = excluded.positioning,
      audience    = excluded.audience,
      voice       = excluded.voice,
      notes       = excluded.notes,
      updated_at  = now()
  `;
  refresh(slug);
}

// ---------------------------------------------------------------------------
// SMART goals
// ---------------------------------------------------------------------------

const LINKABLE = new Set(["followers", "reach", "impressions", "engagement", "posts"]);

export async function addGoal(slug: string, formData: FormData) {
  const client = await clientOr404(slug);

  const title = String(formData.get("title") ?? "").trim();
  const target = Number(String(formData.get("target") ?? "").replace(/,/g, ""));
  const dueOn = String(formData.get("due_on") ?? "");
  if (!title || !Number.isFinite(target) || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return;

  const startsOn = String(formData.get("starts_on") ?? "");
  const sourceMetric = String(formData.get("source_metric") ?? "").trim();
  const sourceNetwork = String(formData.get("source_network") ?? "").trim();

  await sql`
    insert into smart_goals
      (client_id, title, why, metric, unit, baseline, target, manual_current,
       source_metric, source_network, starts_on, due_on)
    values (
      ${client.id}, ${title},
      ${String(formData.get("why") ?? "").trim()},
      ${String(formData.get("metric") ?? "").trim()},
      ${String(formData.get("unit") ?? "").trim()},
      ${Number(String(formData.get("baseline") ?? "0").replace(/,/g, "")) || 0},
      ${target},
      ${formData.get("manual_current") ? Number(formData.get("manual_current")) : null},
      ${LINKABLE.has(sourceMetric) ? sourceMetric : null},
      ${sourceNetwork || null},
      ${/^\d{4}-\d{2}-\d{2}$/.test(startsOn) ? startsOn : new Date().toISOString().slice(0, 10)}::date,
      ${dueOn}::date
    )
  `;
  refresh(slug);
}

/** Record a reading for a goal that isn't wired to analytics. */
export async function updateGoalProgress(
  slug: string,
  goalId: string,
  value: number,
) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(goalId) || !Number.isFinite(value)) return;
  await sql`
    update smart_goals set manual_current = ${value}
    where id = ${goalId} and client_id = ${client.id}
  `;
  refresh(slug);
}

export async function setGoalStatus(
  slug: string,
  goalId: string,
  status: "active" | "achieved" | "missed" | "paused",
) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(goalId)) return;
  await sql`
    update smart_goals set status = ${status}
    where id = ${goalId} and client_id = ${client.id}
  `;
  refresh(slug);
}

export async function deleteGoal(slug: string, goalId: string) {
  const client = await clientOr404(slug);
  if (!UUID_RE.test(goalId)) return;
  await sql`delete from smart_goals where id = ${goalId} and client_id = ${client.id}`;
  refresh(slug);
}
