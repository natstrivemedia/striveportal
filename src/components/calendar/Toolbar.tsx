import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GridIcon,
  ListIcon,
  CalendarDaysIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

export type CalView = "grid" | "calendar" | "list";

export function parseView(raw?: string): CalView {
  return raw === "grid" || raw === "list" ? raw : "calendar";
}

/** '2026-07' → {year, month(0-indexed)}, defaulting to the current month. */
export function parseMonth(raw?: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (m) return { year: Number(m[1]), month: Number(m[2]) - 1 };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function monthParam(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function ViewToggle({
  view,
  hrefFor,
}: {
  view: CalView;
  hrefFor: (v: CalView) => string;
}) {
  const options: { v: CalView; label: string; icon: React.ReactNode }[] = [
    { v: "grid", label: "Grid", icon: <GridIcon size={14} /> },
    { v: "calendar", label: "Calendar", icon: <CalendarDaysIcon size={14} /> },
    { v: "list", label: "List", icon: <ListIcon size={14} /> },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-ink-100 p-1">
      {options.map((o) => (
        <Link
          key={o.v}
          href={hrefFor(o.v)}
          aria-current={view === o.v ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition",
            view === o.v
              ? "bg-white text-ink-900 shadow-lift"
              : "text-ink-500 hover:text-ink-900",
          )}
        >
          {o.icon}
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function MonthNav({
  year,
  month,
  hrefFor,
}: {
  year: number;
  month: number;
  hrefFor: (year: number, month: number) => string;
}) {
  const prev = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const nextM = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };
  const now = new Date();

  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <Link
          href={hrefFor(prev.y, prev.m)}
          aria-label="Previous month"
          className="grid size-8 place-items-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
        >
          <ChevronLeftIcon size={17} />
        </Link>
        <Link
          href={hrefFor(now.getFullYear(), now.getMonth())}
          className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-700 transition hover:bg-ink-100"
        >
          Today
        </Link>
        <Link
          href={hrefFor(nextM.y, nextM.m)}
          aria-label="Next month"
          className="grid size-8 place-items-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
        >
          <ChevronRightIcon size={17} />
        </Link>
        <h2 className="ml-2 text-body font-semibold text-ink-900">{label}</h2>
      </div>
    </div>
  );
}
