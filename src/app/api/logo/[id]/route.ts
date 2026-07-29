/**
 * Serves a client's logo.
 *
 * Unlike post media this is not entitlement-gated: the logo appears in the
 * client's own portal header, which has no session, and it is their public
 * brand mark either way. The id is a UUID, so it is not enumerable.
 */
import { NextResponse, type NextRequest } from "next/server";
import { one } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { UUID_RE } from "@/lib/queries";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new NextResponse("Not found", { status: 404 });

  const row = await one<{ logo_path: string | null }>`
    select logo_path from clients where id = ${id}
  `;
  if (!row?.logo_path) return new NextResponse("Not found", { status: 404 });

  let body: Buffer;
  try {
    body = await getObject(row.logo_path);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": row.logo_path.endsWith(".png") ? "image/png" : "image/webp",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
