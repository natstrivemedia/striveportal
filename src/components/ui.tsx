import { cn } from "@/lib/utils";
import type { ItemStatus, CalendarStatus } from "@/lib/types";

/**
 * Status wording is perspective-dependent. The client portal reads as a to-do
 * list ("Waiting on you"); the same row in admin has to say who it's waiting on
 * ("Awaiting client"), or Strive staff read their own queue backwards.
 */
export const STATUS_LABEL: Record<ItemStatus, string> = {
  draft: "Draft",
  requested: "Sent to Strive Media",
  in_review: "Waiting on you",
  approved: "Approved",
  changes_requested: "Changes requested",
  scheduled: "Scheduled",
  published: "Published",
};

const ADMIN_STATUS_LABEL: Record<ItemStatus, string> = {
  ...STATUS_LABEL,
  requested: "Client request",
  in_review: "Awaiting client",
  changes_requested: "Changes requested",
};

const STATUS_CLASS: Record<ItemStatus, string> = {
  draft: "bg-ink-100 text-ink-500",
  requested: "bg-brand-soft text-ink-700",
  in_review: "bg-warn-100 text-warn-600",
  approved: "bg-ok-100 text-ok-600",
  changes_requested: "bg-stop-100 text-stop-600",
  scheduled: "bg-ink-100 text-ink-700",
  published: "bg-ink-100 text-ink-700",
};

export function StatusPill({
  status,
  audience = "client",
  className,
}: {
  status: ItemStatus | CalendarStatus;
  audience?: "client" | "admin";
  className?: string;
}) {
  const key = status as ItemStatus;
  const label = audience === "admin" ? ADMIN_STATUS_LABEL[key] : STATUS_LABEL[key];
  return (
    // Spec pill: 22px tall, 12px label, 4px side padding, 6px radius.
    <span className={cn("pill shrink-0", STATUS_CLASS[key], className)}>
      {label}
    </span>
  );
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  twitter: "X",
  threads: "Threads",
  pinterest: "Pinterest",
};

export function PlatformChips({ platforms }: { platforms: string[] }) {
  if (!platforms?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {platforms.map((p) => (
        <span key={p} className="pill bg-ink-100 text-ink-700">
          {PLATFORM_LABEL[p] ?? p}
        </span>
      ))}
    </div>
  );
}

export function Card({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  // Spec card: 16px padding, 20px radius, 1px #EBEBEB border. `card-flush`
  // is the variant for cards whose children own the padding.
  return (
    <div className={cn("card-flush", className)} {...rest}>
      {children}
    </div>
  );
}

/** The black numeral that sits beside a section heading. */
export function CountBadge({ n }: { n: number }) {
  return <span className="count-badge">{n}</span>;
}

/** Section heading + count, the app's standard block opener. */
export function SectionHeading({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-h2 font-medium text-ink-900">{children}</h2>
      {count != null && <CountBadge n={count} />}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-ink-200 bg-white/60 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-400">{icon}</div>}
      <p className="text-body font-semibold text-ink-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-body text-ink-500">{body}</p>}
    </div>
  );
}
