"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, one } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getClientById, UUID_RE } from "@/lib/queries";

function refresh() {
  revalidatePath("/admin/ideas", "layout");
}

function parseHashtags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#+/, "").trim())
        .filter(Boolean),
    ),
  );
}

export async function createIdea(formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  // Empty string from the "shared library" option means client_id stays null.
  const rawClient = String(formData.get("client_id") ?? "").trim();
  const clientId = rawClient && UUID_RE.test(rawClient) ? rawClient : null;

  await sql`
    insert into ideas (client_id, title, notes, hashtags, source)
    values (
      ${clientId},
      ${title},
      ${String(formData.get("notes") ?? "").trim()},
      ${parseHashtags(String(formData.get("hashtags") ?? ""))}::text[],
      'admin'
    )
  `;
  refresh();
}

export async function setIdeaStatus(
  ideaId: string,
  status: "open" | "used" | "archived",
) {
  await requireAdmin();
  if (!UUID_RE.test(ideaId)) return;
  await sql`update ideas set status = ${status} where id = ${ideaId}`;
  refresh();
}

export async function deleteIdea(ideaId: string) {
  await requireAdmin();
  if (!UUID_RE.test(ideaId)) return;
  await sql`delete from ideas where id = ${ideaId}`;
  refresh();
}

/**
 * Turn an idea into a real draft post.
 *
 * A shared-library idea has no client of its own, so the caller names the target
 * client. The idea is marked 'used' and linked to what it became, which is how
 * the bank stays honest about what has already been spent.
 */
export async function promoteIdea(ideaId: string, targetClientId: string) {
  await requireAdmin();
  if (!UUID_RE.test(ideaId) || !UUID_RE.test(targetClientId)) return;

  const idea = await one<{
    id: string; title: string; notes: string; hashtags: string[]; platforms: string[];
  }>`select id, title, notes, hashtags, platforms from ideas where id = ${ideaId}`;
  if (!idea) return;

  const client = await getClientById(targetClientId);
  if (!client) return;

  const [item] = await sql<{ id: string }>`
    insert into items (client_id, type, title, caption, hashtags, platforms, status)
    values (${client.id}, 'post', ${idea.title}, ${idea.notes},
            ${idea.hashtags}::text[], ${idea.platforms}::text[], 'draft')
    returning id
  `;

  await sql`
    update ideas set status = 'used', used_item_id = ${item.id} where id = ${ideaId}
  `;

  revalidatePath("/admin/ideas", "layout");
  revalidatePath(`/admin/c/${client.slug}`, "layout");
  redirect(`/admin/c/${client.slug}/i/${item.id}`);
}
