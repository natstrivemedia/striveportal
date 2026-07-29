import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ItemStatus, ItemWithMedia } from "@/lib/types";

/**
 * Status filter for the list view.
 *
 * Labelled by what has to happen next, not by the database's word for it:
 * "Approval" is work sitting with the client, "Revisions" is work sitting with
 * you. Counts are always visible so an empty stage still reads as zero rather
 * than disappearing.
 */
export const STATUS_TABS: { key: string; label: string; match: ItemStatus[] }[] = [
  { key: "draft", label: "Drafts", match: ["draft"] },
  { key: "requested", label: "Requests", match: ["requested"] },
  { key: "changes_requested", label: "Revisions", match: ["changes_requested"] },
  { key: "in_review", label: "Approval", match: ["in_review"] },
  { key: "approved", label: "Approved", match: ["approved", "scheduled"] },
  { key: "published", label: "Done", match: ["published"] },
];

export function filterByTab(items: ItemWithMedia[], tab?: string): ItemWithMedia[] {
  const found = STATUS_TABS.find((t) => t.key === tab);
  if (!found) return items;
  return items.filter((i) => found.match.includes(i.status));
}

export function StatusTabs({
  items,
  active,
  hrefFor,
}: {
  items: ItemWithMedia[];
  active?: string;
  hrefFor: (key: string | undefined) => string;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1">
      <Link
        href={hrefFor(undefined)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body transition",
          !active ? "bg-ink-100 font-medium text-ink-900" : "text-ink-500 hover:text-ink-900",
        )}
      >
        All
        <Count n={items.length} active={!active} />
      </Link>

      {STATUS_TABS.map((t) => {
        const n = items.filter((i) => t.match.includes(i.status)).length;
        const on = active === t.key;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body transition",
              on ? "bg-ink-100 font-medium text-ink-900" : "text-ink-500 hover:text-ink-900",
            )}
          >
            {t.label}
            <Count n={n} active={on} />
          </Link>
        );
      })}
    </nav>
  );
}

function Count({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 text-[11px] font-semibold tabular-nums",
        active ? "bg-white text-ink-700" : "bg-ink-100 text-ink-500",
      )}
    >
      {n}
    </span>
  );
}
