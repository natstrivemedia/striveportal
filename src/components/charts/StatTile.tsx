import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "@/components/icons";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * A single headline number. Per the dataviz form heuristic, one number with a
 * comparison is a stat tile, not a chart — a one-point "trend" is noise.
 *
 * The delta pairs an arrow icon with a signed value so direction never rests on
 * colour alone.
 */
export function StatTile({
  label,
  value,
  delta,
  suffix,
  windowLabel = "30d",
}: {
  label: string;
  value: number;
  delta?: number | null;
  suffix?: string;
  windowLabel?: string;
}) {
  const direction = delta == null ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const Icon = direction === "up" ? ArrowUpIcon : direction === "down" ? ArrowDownIcon : MinusIcon;

  return (
    <div className="rounded-[20px] border border-ink-200 bg-white p-4 shadow-lift">
      <p className="text-small font-medium text-ink-500">{label}</p>
      <p className="mt-1 text-h1 font-bold text-ink-900">
        {formatNumber(value)}
        {suffix && <span className="ml-0.5 text-body font-semibold text-ink-500">{suffix}</span>}
      </p>
      {delta != null && (
        <p
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-small font-semibold",
            direction === "up" && "text-ok-600",
            direction === "down" && "text-stop-600",
            direction === "flat" && "text-ink-500",
          )}
        >
          <Icon size={13} strokeWidth={2.5} />
          {delta > 0 ? "+" : ""}
          {formatNumber(delta)}
          <span className="font-normal text-ink-400">vs previous {windowLabel}</span>
        </p>
      )}
    </div>
  );
}
