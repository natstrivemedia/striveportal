/**
 * Serves an uploaded file only to someone entitled to it.
 *
 * Entitlement is re-derived per request: either a portal token that resolves to
 * the client owning the media, or an admin session. There is no public URL and
 * no long-lived signed link, so revoking a client's token revokes their media
 * access at the same moment.
 */
import { NextResponse, type NextRequest } from "next/server";
import { one } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { resolveClient } from "@/lib/portal";
import { isAdmin } from "@/lib/auth";
import { UUID_RE } from "@/lib/queries";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new NextResponse("Not found", { status: 404 });

  const row = await one<{
    storage_path: string;
    mime_type: string;
    file_name: string | null;
    client_id: string;
  }>`
    select m.storage_path, m.mime_type, m.file_name, i.client_id
    from item_media m
    join items i on i.id = m.item_id
    where m.id = ${id}
  `;
  if (!row) return new NextResponse("Not found", { status: 404 });

  const token = req.nextUrl.searchParams.get("t");
  const client = token ? await resolveClient(token) : null;
  const entitled = client?.id === row.client_id || (await isAdmin());

  // 404 rather than 403: a 403 would confirm the file exists.
  if (!entitled) return new NextResponse("Not found", { status: 404 });

  let body: Buffer;
  try {
    body = await getObject(row.storage_path);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename="${(row.file_name ?? "file").replace(/"/g, "")}"`,
      // Private: the response is entitlement-scoped, so no shared cache may keep it.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
