import "server-only";

/**
 * Image resizing that degrades instead of breaking.
 *
 * sharp is a native binary: it works on Node (local dev, Vercel) and cannot run
 * on Cloudflare Workers. Rather than branch call sites on the deploy target,
 * this returns the original bytes wherever sharp is unavailable — an
 * unoptimised image is a far better outcome than a failed upload.
 *
 * The runtime check comes first so the Workers bundle never even attempts the
 * import; a bare try/catch would still pull sharp into the bundle graph.
 */

/** Workers expose a `navigator.userAgent` of "Cloudflare-Workers". */
function canUseSharp(): boolean {
  if (process.env.DISABLE_SHARP === "1") return false;
  const ua = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent;
  return ua !== "Cloudflare-Workers";
}

export type Resized = { body: Buffer; ext: string; contentType: string; resized: boolean };

/**
 * Fit an image inside `size`×`size` and re-encode as WebP.
 *
 * `fit: contain` for logos (never crop a wordmark); `inside` for thumbnails,
 * which may keep their aspect ratio.
 */
export async function resizeImage(
  input: Buffer,
  size: number,
  mode: "contain" | "inside",
  fallbackType: string,
  fallbackExt: string,
): Promise<Resized> {
  if (!canUseSharp()) {
    return { body: input, ext: fallbackExt, contentType: fallbackType, resized: false };
  }

  try {
    const sharp = (await import("sharp")).default;
    const body = await sharp(input, { animated: false })
      .resize(size, size, {
        fit: mode,
        withoutEnlargement: mode === "inside",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: mode === "contain" ? 90 : 80 })
      .toBuffer();
    return { body, ext: "webp", contentType: "image/webp", resized: true };
  } catch {
    return { body: input, ext: fallbackExt, contentType: fallbackType, resized: false };
  }
}

/** Pixel dimensions, when they can be read. Null everywhere sharp is absent. */
export async function imageSize(
  input: Buffer,
): Promise<{ width: number | null; height: number | null }> {
  if (!canUseSharp()) return { width: null, height: null };
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(input).metadata();
    return { width: meta.width ?? null, height: meta.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}
