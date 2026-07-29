import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getWorkspace, isHex } from "@/lib/workspace";
import { putObject, deleteObject } from "@/lib/storage";
import { AppearanceForm } from "@/components/admin/AppearanceForm";

export const metadata = { title: "Appearance · Strive Media" };

async function save(formData: FormData) {
  "use server";
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim() || "Strive Media Co.";
  const pick = (key: string, fallback: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return isHex(v) ? v : fallback;
  };

  const current = await getWorkspace();

  await sql`
    update workspace set
      name       = ${name},
      accent     = ${pick("accent", current.accent)},
      sidebar_bg = ${pick("sidebar_bg", current.sidebar_bg)},
      page_bg    = ${pick("page_bg", current.page_bg)},
      updated_at = now()
    where id = 1
  `;

  const file = formData.get("logo");
  if (file instanceof File && file.size > 0 && file.type.startsWith("image/")) {
    let body = Buffer.from(await file.arrayBuffer());
    let ext = "png";
    try {
      const sharp = (await import("sharp")).default;
      body = await sharp(body)
        .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 })
        .toBuffer();
      ext = "webp";
    } catch {
      /* resizing is an optimisation, not a requirement */
    }
    const key = await putObject(`workspace/icon-${Date.now()}.${ext}`, body, "image/webp");
    const previous = current.logo_path;
    await sql`update workspace set logo_path = ${key} where id = 1`;
    if (previous) await deleteObject(previous).catch(() => {});
  }

  revalidatePath("/admin", "layout");
}

async function removeLogo() {
  "use server";
  await requireAdmin();
  const current = await getWorkspace();
  if (current.logo_path) await deleteObject(current.logo_path).catch(() => {});
  await sql`update workspace set logo_path = null where id = 1`;
  revalidatePath("/admin", "layout");
}

export default async function AppearancePage() {
  await requireAdmin();
  const ws = await getWorkspace();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-h1 font-medium text-ink-900">Appearance</h1>
      <p className="mt-1 text-body text-ink-500">
        Your own branding. Changes apply immediately — no redeploy, no code.
      </p>
      <AppearanceForm workspace={ws} onSave={save} onRemoveLogo={removeLogo} />
    </div>
  );
}
