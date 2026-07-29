"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnalyticsIcon, CalendarDaysIcon, CheckIcon, EditIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Portal navigation.
 *
 * Approvals stays first and carries the count badge — it is the only tab with
 * anything waiting on the client, and the reason they opened the link.
 */
export function PortalTabs({
  token,
  pending,
}: {
  token: string;
  pending: number;
}) {
  const pathname = usePathname();
  const base = `/p/${token}`;

  const tabs = [
    { href: base, label: "Approvals", icon: <CheckIcon size={15} />, badge: pending },
    { href: `${base}/content`, label: "Content", icon: <CalendarDaysIcon size={15} /> },
    { href: `${base}/new`, label: "New post", icon: <EditIcon size={15} /> },
    { href: `${base}/analytics`, label: "Analytics", icon: <AnalyticsIcon size={15} /> },
  ];

  return (
    <nav className="sticky top-[57px] z-10 border-b border-ink-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-2 py-1.5">
        {tabs.map((t) => {
          const active =
            t.href === base ? pathname === base : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-body font-medium transition",
                  active
                    ? "bg-brand text-[var(--brand-on)]"
                    : "text-ink-500 hover:bg-ink-100 hover:text-ink-900",
                )}
              >
                {t.icon}
                {t.label}
                {t.badge ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-bold",
                      active ? "bg-white/25" : "bg-warn-100 text-warn-600",
                    )}
                  >
                    {t.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
