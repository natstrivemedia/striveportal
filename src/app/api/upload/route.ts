/**
 * Admin media upload. Stores the original plus a web-sized thumbnail so list
 * views don't pull full-resolution artwork over a phone connection.
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { one, sql } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { putObject } from "@/lib/storage";
import { UUID_RE } from "@/lib/queries";
import { resolveClient } from "@/lib/portal";
import { imageSize, resizeImage } from "@/lib/image";

type ItemRow = {
  id: string;
  client_id: string;
  status: string;
  created_by: string;
};

/**
 * Who may attach media to this item.
 *
 * Admins: anything. Clients: only an item they own, that they authored, and
 * that is still a request — so a client can illustrate their own proposal but
 * can never alter artwork on a post that has already been approved.
 */
async function canEdit(item: ItemRow, token: string | null): Promise<boolean> {
  if (await isAdmin()) return true;
  if (!token) return false;
  const client = await resolveClient(token);
  return (
    client?.id === item.client_id &&
    item.created_by === "client" &&
    item.status === "requested"
  );
}

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
]);

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const itemId = String(form.get("itemId") ?? "");
  const token = form.get("token") ? String(form.get("token")) : null;
  const file = form.get("file");

  if (!UUID_RE.test(itemId)) {
    return NextResponse.json({ error: "bad itemId" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 50MB)" }, { status: 413 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `unsupported type: ${file.type}` }, { status: 415 });
  }

  const item = await one<ItemRow>`
    select id, client_id, status, created_by from items where id = ${itemId}
  `;
  // 404 rather than 403 — same reasoning as the media route.
  if (!item) return NextResponse.json({ error: "unknown item" }, { status: 404 });
  if (!(await canEdit(item, token))) {
    return NextResponse.json({ error: "unknown item" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().slice(0, 8);
  const base = `${item.client_id}/${itemId}/${randomUUID()}`;

  const storagePath = await putObject(`${base}.${ext}`, buffer, file.type);

  let width: number | null = null;
  let height: number | null = null;
  let thumbPath: string | null = null;

  if (file.type.startsWith("image/")) {
    // Both degrade to no-ops where sharp is unavailable (Cloudflare Workers);
    // a thumbnail is an optimisation, never a reason to lose an upload.
    ({ width, height } = await imageSize(buffer));
    const thumb = await resizeImage(buffer, 640, "inside", file.type, ext);
    if (thumb.resized) {
      thumbPath = await putObject(`${base}.thumb.${thumb.ext}`, thumb.body, thumb.contentType);
    }
  }

  const [{ position }] = await sql<{ position: number }>`
    select coalesce(max(position) + 1, 0) as position
    from item_media where item_id = ${itemId}
  `;

  const [media] = await sql<{ id: string }>`
    insert into item_media
      (item_id, storage_path, thumb_path, mime_type, file_name, byte_size,
       width, height, position)
    values
      (${itemId}, ${storagePath}, ${thumbPath}, ${file.type}, ${file.name},
       ${file.size}, ${width}, ${height}, ${Number(position)})
    returning id
  `;

  return NextResponse.json({ ok: true, mediaId: media.id });
}

export async function DELETE(req: NextRequest) {
  const mediaId = req.nextUrl.searchParams.get("mediaId") ?? "";
  const token = req.nextUrl.searchParams.get("token");
  if (!UUID_RE.test(mediaId)) {
    return NextResponse.json({ error: "bad mediaId" }, { status: 400 });
  }

  const item = await one<ItemRow>`
    select i.id, i.client_id, i.status, i.created_by
    from item_media m join items i on i.id = m.item_id
    where m.id = ${mediaId}
  `;
  if (!item) return NextResponse.json({ error: "unknown media" }, { status: 404 });
  if (!(await canEdit(item, token))) {
    return NextResponse.json({ error: "unknown media" }, { status: 404 });
  }

  await sql`delete from item_media where id = ${mediaId}`;
  return NextResponse.json({ ok: true });
}
