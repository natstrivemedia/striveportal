/**
 * Object storage with two backends, chosen by env:
 *
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY -> Supabase Storage (private bucket)
 *   otherwise                                -> local disk under .data/uploads
 *
 * Media is never served by a public URL from either backend. Everything goes
 * through /api/media/[id], which re-checks that the requester (portal token or
 * admin session) is entitled to that specific file. Slower than a CDN, and
 * correct by default — the right trade for five clients.
 */
import "server-only";

import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const BUCKET = process.env.SUPABASE_BUCKET ?? "media";
const LOCAL_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".data", "uploads");

function useSupabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function supabaseClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Reject traversal and absolute paths before they reach the filesystem. */
function safeKey(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..") || path.isAbsolute(normalized)) {
    throw new Error(`unsafe storage key: ${key}`);
  }
  return normalized;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const safe = safeKey(key);

  if (useSupabase()) {
    const supabase = await supabaseClient();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(safe, body, { contentType, upsert: true });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
    return safe;
  }

  const dest = path.join(LOCAL_ROOT, safe);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, body);
  return safe;
}

export async function getObject(key: string): Promise<Buffer> {
  const safe = safeKey(key);

  if (useSupabase()) {
    const supabase = await supabaseClient();
    const { data, error } = await supabase.storage.from(BUCKET).download(safe);
    if (error || !data) throw new Error(`storage read failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  return readFile(path.join(LOCAL_ROOT, safe));
}

export async function deleteObject(key: string): Promise<void> {
  const safe = safeKey(key);
  if (useSupabase()) {
    const supabase = await supabaseClient();
    await supabase.storage.from(BUCKET).remove([safe]);
    return;
  }
  await unlink(path.join(LOCAL_ROOT, safe)).catch(() => {});
}

export const storageBackend = () => (useSupabase() ? "supabase" : "local");
