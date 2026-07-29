import Link from "next/link";
import { SelectBox } from "@/components/admin/SelectionBar";
import { DayCell, Draggable, EventChip } from "@/components/calendar/CalendarInteractions";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/types";
import type { ItemStatus, ItemWithMedia } from "@/lib/types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DOT: Record<ItemStatus, string> = {
  draft: "bg-ink-400",
  requested: "bg-brand",
  in_review: "bg-warn-600",
  approved: "bg-ok-600",
  changes_requested: "bg-stop-600",
  scheduled: "bg-ink-700",
  published: "bg-ink-900",
};

const DOT_LABEL: Record<ItemStatus, string> = {
  draft: "Draft",
  requested: "Request",
  in_review: "In review",
  approved: "Approved",
  changes_requested: "Changes",
  scheduled: "Scheduled",
  published: "Published",
};

const PLATFORM_MARK: Record<string, string> = {
  instagram: "IG",
  facebook: "FB",
  tiktok: "TT",
  linkedin: "LI",
  youtube: "YT",
  twitter: "X",
  threads: "TH",
  pinterest: "PI",
};

/**
 * A real month grid — the calendar is the page, not a summary strip above one.
 *
 * Days are fixed-height with their own scroll so a heavy week can't stretch the
 * row and shove the rest of the month off screen; the grid keeps its shape no
 * matter how the content lands.
 */
export function MonthCalendar({
  year,
  month,
  items,
  timeZone,
  hrefFor,
  today = new Date(),
  handle,
  events = [],
  slug,
}: {
  year: number;
  /** 0-indexed, matching Date. */
  month: number;
  items: ItemWithMedia[];
  timeZone: string;
  hrefFor: (itemId: string) => string;
  today?: Date;
  handle?: string | null;
  events?: CalendarEvent[];
  /** Admin only — enables editing events. Omitted in the client portal. */
  slug?: string;
}) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const daysInPrev = new Date(year, month, 0).getDate();

  // 6 rows x 7 always, so the grid doesn't reflow between months.
  const cells: { day: number; inMonth: boolean; key: string }[] = [];
  for (let i = leading - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, inMonth: false, key: `p${i}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, key: `c${d}` });
  }
  let next = 1;
  while (cells.length < 42) {
    cells.push({ day: next, inMonth: false, key: `n${next}` });
    next += 1;
  }

  // Bucket by the day the client will actually see, not by UTC.
  const byDay = new Map<number, ItemWithMedia[]>();
  const dayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  for (const item of items) {
    if (!item.scheduled_for) continue;
    const parts = dayFmt.formatToParts(new Date(item.scheduled_for));
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    if (y !== year || m !== month + 1) continue;
    byDay.set(d, [...(byDay.get(d) ?? []), item]);
  }

  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="grid grid-cols-7 border-b border-ink-200 bg-white">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="border-r border-ink-200 px-3 py-2.5 text-center text-[13px] font-medium text-ink-700 last:border-r-0"
          >
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d.slice(0, 3)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const dayItems = cell.inMonth ? (byDay.get(cell.day) ?? []) : [];
          const iso = cell.inMonth
            ? `${year}-${String(month + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`
            : "";
          const dayEvents = cell.inMonth
            ? events.filter((e) => iso >= e.starts_on && iso <= (e.ends_on ?? e.starts_on))
            : [];

          return (
            <DayCell
              key={cell.key}
              isoDate={iso}
              inMonth={cell.inMonth}
              className={cn(
                "min-h-32 border-b border-r border-ink-200 p-1.5",
                i % 7 === 6 && "border-r-0",
                i >= 35 && "border-b-0",
                !cell.inMonth && "bg-ink-50/60",
              )}
            >
              <div className="mb-1 flex items-center px-1">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-md text-small",
                    cell.inMonth ? "text-ink-700" : "text-ink-300",
                    cell.inMonth && isToday(cell.day) &&
                      "bg-brand font-bold text-[var(--brand-on,#fff)]",
                  )}
                >
                  {cell.day}
                </span>
              </div>

              {/* Events sit above posts — they're the context the posts live in. */}
              {dayEvents.map((e) => (
                <EventChip key={e.id} slug={slug ?? ""} event={e} />
              ))}

              <div className="flex max-h-24 flex-col gap-1 overflow-y-auto">
                {dayItems.map((item) => (
                  <Draggable key={item.id} id={item.id}>
                    <DayCard item={item} href={hrefFor(item.id)} handle={handle} />
                  </Draggable>
                ))}
              </div>
            </DayCell>
          );
        })}
      </div>
    </div>
  );
}

function DayCard({
  item,
  href,
  handle,
}: {
  item: ItemWithMedia;
  href: string;
  handle?: string | null;
}) {
  const selectable = item.status === "draft" || item.status === "requested";

  return (
    // The checkbox overlays the card rather than living inside the anchor —
    // a control nested in a link is invalid HTML and swallows the wrong clicks.
    <div className="relative">
      {selectable && (
        <span className="absolute right-1.5 top-1.5 z-10">
          <SelectBox id={item.id} />
        </span>
      )}
      <Link
        href={href}
        className="block rounded-lg border border-ink-200 bg-white px-2 py-1.5 transition hover:border-ink-400 hover:shadow-lift"
      >
      <span className="flex items-center gap-1.5 pr-4">
        <span className={cn("size-1.5 shrink-0 rounded-full", DOT[item.status])} />
        <span className="flex-1 truncate text-[11px] font-medium text-ink-500">
          {DOT_LABEL[item.status]}
        </span>
      </span>

      {(handle || item.platforms.length > 0) && (
        <span className="mt-0.5 flex items-center gap-1">
          {item.platforms.slice(0, 3).map((p) => (
            <span
              key={p}
              title={p}
              className="rounded bg-ink-100 px-1 text-[9px] font-bold leading-4 text-ink-500"
            >
              {PLATFORM_MARK[p] ?? p.slice(0, 2).toUpperCase()}
            </span>
          ))}
          {handle && (
            <span className="truncate text-[10px] text-ink-400">{handle}</span>
          )}
        </span>
      )}

      <span className="mt-0.5 block truncate text-small font-semibold text-ink-900">
        {item.title || item.caption.split("\n")[0] || "Untitled"}
      </span>
      </Link>
    </div>
  );
}
