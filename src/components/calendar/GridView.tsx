import Link from "next/link";
import { StatusPill } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { ItemWithMedia } from "@/lib/types";

/**
 * Feed grid — the layout the post will actually live in.
 *
 * Squares in scheduled order, so you can see the rhythm of a profile before it
 * exists: three carousels in a row, or four dark photos back to back.
 */
export function GridView({
  items,
  hrefFor,
  mediaToken,
  audience = "admin",
}: {
  items: ItemWithMedia[];
  hrefFor: (id: string) => string;
  mediaToken?: string;
  audience?: "admin" | "client";
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-ink-200 bg-white p-12 text-center text-body text-ink-400">
        Nothing scheduled this month
      </p>
    );
  }

  const src = (id: string) =>
    mediaToken ? `/api/media/${id}?t=${encodeURIComponent(mediaToken)}` : `/api/media/${id}`;

  return (
    <ul className="grid grid-cols-3 gap-1 sm:gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={hrefFor(item.id)} className="group relative block">
            <span className="block aspect-square overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
              {item.media[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src(item.media[0].id)}
                  alt=""
                  className="size-full object-cover transition group-hover:opacity-90"
                />
              ) : (
                <span className="grid size-full place-items-center p-2 text-center text-[11px] leading-tight text-ink-400">
                  {item.title || "Untitled"}
                </span>
              )}
            </span>
            <span className="absolute left-1.5 top-1.5">
              <StatusPill status={item.status} audience={audience} className="scale-90 shadow-lift" />
            </span>
            {item.scheduled_for && (
              <span className="absolute bottom-1.5 right-1.5 rounded bg-ink-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {formatDate(item.scheduled_for, { month: "short", day: "numeric" })}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
