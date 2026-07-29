import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/portal";
import { getItem } from "@/lib/queries";
import { saveRequest, type RequestPayload } from "@/app/p/[token]/actions";
import { ComposerModal, type ComposerValues } from "@/components/composer/ComposerModal";
import { listPillars } from "@/lib/goals";
import { DiscardRequestButton } from "@/components/portal/DiscardRequestButton";

export const metadata = { title: "Write a post", robots: { index: false } };

function toLocalInput(value: Date | string | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function ClientComposePage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  const client = await requireClient(token);

  const item = await getItem(client.id, id);
  // Only the client's own, still-editable requests open in the composer.
  if (!item || item.created_by !== "client" || item.status !== "requested") notFound();

  const pillars = await listPillars(client.id);

  async function save(values: ComposerValues) {
    "use server";
    const payload: RequestPayload = {
      title: values.title,
      caption: values.caption,
      platforms: values.platforms,
      hashtags: values.hashtags,
      scheduledFor: values.scheduledFor,
    };
    return saveRequest(token, id, payload);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href={`/p/${token}/new`} className="text-small text-ink-500 hover:underline">
          ← Your drafts
        </Link>
        <DiscardRequestButton token={token} itemId={item.id} />
      </div>

      {/* Same editor Strive uses, in client mode — one composer, so the two
          sides never drift apart. */}
      <ComposerModal
        mode="client"
        itemId={item.id}
        brandName={client.name}
        brandColor={client.brand_color}
        handle={Object.values(client.handles ?? {})[0] ?? null}
        media={item.media}
        uploadToken={token}
        closeHref={`/p/${token}/new`}
        onSave={save}
        primaryLabel="Send to Strive Media"
        pillars={pillars}
        initial={{
          title: item.title ?? "",
          caption: item.caption,
          platforms: item.platforms,
          hashtags: item.hashtags ?? [],
          labels: item.labels ?? [],
          format: item.format ?? "post",
          pillarId: item.pillar_id,
          scheduledFor: toLocalInput(item.scheduled_for),
          status: item.status,
          internalNote: "",
        }}
      />
    </main>
  );
}
