import { notFound } from "next/navigation";
import { requireClient } from "@/lib/portal";
import { getClientVisibleItem, listComments, listClientVisibleItems } from "@/lib/queries";
import { MediaStrip } from "@/components/portal/MediaStrip";
import { ApproveBar } from "@/components/portal/ApproveBar";
import { CommentThread } from "@/components/portal/CommentThread";
import { StatusPill, PlatformChips } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  const client = await requireClient(token);

  // Scoped to this client — another client's id yields null, and therefore a
  // 404 rather than a 403 that would confirm the item exists.
  const item = await getClientVisibleItem(client.id, id);
  if (!item) notFound();

  const [comments, all] = await Promise.all([
    listComments(item.id),
    listClientVisibleItems(client.id),
  ]);

  const pending = all.filter((i) => i.status === "in_review");
  const position = pending.findIndex((i) => i.id === item.id);

  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-8 pt-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {item.title && (
              <h1 className="truncate text-h2 font-bold text-ink-900">
                {item.title}
              </h1>
            )}
            <p className="mt-0.5 text-small text-ink-500">
              {item.scheduled_for
                ? formatDate(
                    item.scheduled_for,
                    { weekday: "long", month: "long", day: "numeric" },
                    client.timezone,
                  )
                : "Not scheduled yet"}
              {position >= 0 && pending.length > 1 && (
                <span> · {position + 1} of {pending.length}</span>
              )}
            </p>
          </div>
          <StatusPill status={item.status} />
        </div>

        <MediaStrip media={item.media} token={token} title={item.title} />

        {item.caption && (
          <div className="mt-5 rounded-[20px] border border-ink-200 bg-white p-4">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-900">
              {item.caption}
            </p>
            {item.platforms.length > 0 && (
              <div className="mt-3 border-t border-ink-100 pt-3">
                <PlatformChips platforms={item.platforms} />
              </div>
            )}
          </div>
        )}

        <CommentThread token={token} itemId={item.id} comments={comments} />
      </main>

      <ApproveBar token={token} itemId={item.id} status={item.status} />
    </>
  );
}
