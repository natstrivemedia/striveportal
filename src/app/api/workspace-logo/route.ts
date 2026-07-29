import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { getObject } from "@/lib/storage";

/** Serves the workspace icon. Staff-facing branding, so not entitlement-gated. */
export async function GET() {
  const ws = await getWorkspace();
  if (!ws.logo_path) return new NextResponse("Not found", { status: 404 });

  try {
    const body = await getObject(ws.logo_path);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": ws.logo_path.endsWith(".png") ? "image/png" : "image/webp",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
