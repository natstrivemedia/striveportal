import Link from "next/link";
import { VideoIcon, MediaIcon as ImageIcon, MessageIcon, EditIcon, PlayIcon } from "@/components/icons";
import { SelectBox } from "@/components/admin/SelectionBar";
import { ItemMenu } from "@/components/admin/ItemMenu";
import { formatDate, timeAgo, cn } from "@/lib/utils";
import type { ContentPillar, ItemStatus, ItemWithMedia } from "@/lib/types";

const STATUS_DOT: Record<ItemStatus, string> = {
  draft: "bg-ink-400",
  requested: "bg-brand",
  in_review: "bg-warn-600",
  approved: "bg-ok-600",
  changes_requested: "bg-stop-600",
  scheduled: "bg-ink-700",
  published: "bg-ink-900",
};

const STATUS_TEXT: Record<ItemStatus, string> = {
  draft: "Draft",
  requested: "Request",
  in_review: "Approval",
  approved: "Approved",
  changes_requested: "Revisions",
  scheduled: "Scheduled",
  published: "Done",
};

const FORMAT_ICON: Record<string, React.ReactNode> = {
  post: <ImageIcon size={12} />,
  video: <VideoIcon size={12} />,
  story: <PlayIcon size={12} />,
  reel: <VideoIcon size={12} />,
  carousel: <ImageIcon size={12} />,
};

const PLATFORM_MARK: Record<string, string> = {
  instagram: "IG", facebook: "FB", tiktok: "TT", linkedin: "LI",
  youtube: "YT", twitter: "X", threads: "TH", pinterest: "PI",
};

/**
 * Date-grouped list.
 *
 * Grouped by the day a post goes out, with unscheduled work first — an
 * undated post is the one most likely to be forgotten, so it leads rather than
 * being buried at the bottom.
 */
export function ListView({
  items,
  hrefFor,
  timeZone,
  mediaToken,
  handles = {},
  pillars = [],
  slug,
  commentCounts = {},
}: {
  items: ItemWithMedia[];
  hrefFor: (id: string) => string;
  timeZone: string;
  mediaToken?: string;
  handles?: Record<string, string>;
  pillars?: ContentPillar[];
  /** Admin only — enables the edit and overflow controls. */
  slug?: string;
  commentCounts?: Record<string, number>;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-ink-200 bg-white p-12 text-center text-body text-ink-400">
        Nothing here
      </p>
    );
  }

  const src = (id: string) =>
    mediaToken ? `/api/media/${id}?t=${encodeURIComponent(mediaToken)}` : `/api/media/${id}`;

  const pillarById = new Map(pillars.map((p) => [p.id, p]));

  // Group by rendered day so the header matches what each row shows.
  const groups = new Map<string, { label: string; items: ItemWithMedia[] }>();
  for (const item of items) {
    const key = item.scheduled_for
      ? formatDate(item.scheduled_for, { year: "numeric", month: "2-digit", day: "2-digit" }, timeZone)
      : "";
    const label = item.scheduled_for
      ? formatDate(item.scheduled_for, { weekday: "long", month: "long", day: "numeric" }, timeZone)
      : "No date";
    const g = groups.get(key) ?? { label, items: [] };
    g.items.push(item);
    groups.set(key, g);
  }

  const ordered = [...groups.entries()].sort(([a], [b]) => {
    if (a === "") return -1;
    if (b === "") return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex flex-col gap-8">
      {ordered.map(([key, group]) => (
        <section key={key || "no-date"}>
          <h3 className="mb-3 text-[15px] text-ink-500">
            {group.label.includes(",") ? (
              <>
                <span className="font-medium text-ink-900">
                  {group.label.split(",")[0]},
                </span>{" "}
                {group.label.split(",").slice(1).join(",").trim()}
              </>
            ) : (
              group.label
            )}
          </h3>

          <ul className="flex flex-col gap-4">
            {group.items.map((item) => {
              const pillar = item.pillar_id ? pillarById.get(item.pillar_id) : null;
              const handle =
                handles[item.platforms[0]] ?? Object.values(handles)[0] ?? null;

              return (
                <li key={item.id} className="flex items-start gap-4">
                  {/* Left gutter: time and state */}
                  <div className="w-28 shrink-0 pt-1 text-right">
                    <p className="text-body text-ink-500">
                      {item.scheduled_for
                        ? formatDate(
                            item.scheduled_for,
                            { hour: "numeric", minute: "2-digit" },
                            timeZone,
                          )
                        : "No date"}
                    </p>
                    <span className="pill mt-1.5 bg-ink-100 text-ink-700">
                      <span className={cn("size-1.5 rounded-full", STATUS_DOT[item.status])} />
                      {STATUS_TEXT[item.status]}
                    </span>
                    {slug && (item.status === "draft" || item.status === "requested") && (
                      <span className="mt-2 block">
                        <SelectBox id={item.id} />
                      </span>
                    )}
                  </div>

                  {/* Card */}
                  <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-ink-200 bg-white">
                    <Link href={hrefFor(item.id)} className="block p-4 transition hover:bg-ink-50">
                      <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex items-center gap-1.5">
                              {item.platforms.slice(0, 2).map((p) => (
                                <span
                                  key={p}
                                  title={p}
                                  className="rounded bg-ink-100 px-1 text-[9px] font-bold leading-4 text-ink-500"
                                >
                                  {PLATFORM_MARK[p] ?? p.slice(0, 2).toUpperCase()}
                                </span>
                              ))}
                            </span>
                            <span className="truncate text-body font-semibold text-ink-900">
                              {handle ?? "—"}
                            </span>
                            <span className="flex-1" />
                            {pillar && (
                              <span
                                className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                                style={{
                                  background: `${pillar.color}1a`,
                                  color: pillar.color,
                                }}
                              >
                                {pillar.name}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-medium capitalize text-ink-700">
                              {FORMAT_ICON[item.format] ?? FORMAT_ICON.post}
                              {item.format}
                            </span>
                          </div>

                          <p
                            className={cn(
                              "mt-2 line-clamp-4 text-body leading-relaxed",
                              item.caption ? "text-ink-700" : "italic text-ink-400",
                            )}
                          >
                            {item.caption || "No caption"}
                          </p>
                        </div>

                        <span className="grid size-32 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-100 text-[10px] text-ink-400">
                          {item.media[0] ? (
                            item.media[0].mime_type.startsWith("video/") ? (
                              <video
                                src={src(item.media[0].id)}
                                className="size-full object-cover"
                                muted
                                playsInline
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={src(item.media[0].id)}
                                alt=""
                                className="size-full object-cover"
                              />
                            )
                          ) : (
                            "No media"
                          )}
                        </span>
                      </div>
                    </Link>

                    <div className="flex items-center gap-2 border-t border-ink-100 px-4 py-2.5">
                      <span className="flex-1 text-[13px] text-ink-500">
                        Created {timeAgo(item.created_at)}
                      </span>
                      {slug && (
                        <>
                          <Link
                            href={hrefFor(item.id)}
                            aria-label="Edit post"
                            className="grid size-7 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
                          >
                            <EditIcon size={14} />
                          </Link>
                          <ItemMenu slug={slug} itemId={item.id} status={item.status} />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Opens the post with its conversation already showing — the
                      bubble should land you in comments, not on the editor. */}
                  <Link
                    href={`${hrefFor(item.id)}&tab=activity`}
                    aria-label={
                      commentCounts[item.id]
                        ? `${commentCounts[item.id]} comments`
                        : "Add a comment"
                    }
                    className="relative mt-1 grid size-9 shrink-0 place-items-center rounded-lg border border-ink-200 bg-white text-ink-400 transition hover:border-ink-400 hover:text-ink-900"
                  >
                    <MessageIcon size={15} />
                    {commentCounts[item.id] ? (
                      <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-brand text-[10px] font-medium text-white">
                        {commentCounts[item.id]}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
