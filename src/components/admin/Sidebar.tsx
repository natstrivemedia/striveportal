"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnalyticsIcon, CalendarDaysIcon, ChevronDownIcon, HomeIcon, IdeaIcon, LinkIcon, PlusIcon, SearchIcon, SettingsIcon, CompetitorIcon, StrategyIcon } from "@/components/icons";
import { ClientAvatar } from "@/components/ClientAvatar";
import { cn } from "@/lib/utils";

export type SidebarClient = {
  id: string;
  name: string;
  slug: string;
  brand_color: string;
  portal_token: string;
  pending: number;
  hasLogo: boolean;
};

/**
 * Workspace navigation.
 *
 * Each client expands to the two places you actually go: their Content
 * calendar, and their live Portal — the same link the client uses, so opening
 * it is the fastest way to see exactly what they see.
 */
export function Sidebar({
  clients,
  workspace,
}: {
  clients: SidebarClient[];
  workspace: { name: string; hasLogo: boolean };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const active = clients.find((c) => pathname.startsWith(`/admin/c/${c.slug}`));
    return active ? { [active.slug]: true } : {};
  });
  const [filter, setFilter] = useState("");

  const shown = filter
    ? clients.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
    : clients;

  const totalPending = clients.reduce((n, c) => n + c.pending, 0);

  return (
    // Spec: 230px sidebar, 8px inner padding to match nav rows. No border —
    // it shares the page plane, and the white content panel provides the edge.
    <aside
      className="flex w-sidebar shrink-0 flex-col px-2"
      style={{ background: "var(--sidebar-bg)" }}
    >
      <div className="flex items-center gap-2 px-2 py-4">
        {workspace.hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/api/workspace-logo" alt="" className="size-7 rounded-lg object-contain" />
        ) : (
          <span className="grid size-7 place-items-center rounded-lg bg-brand text-small font-medium text-white">
            {workspace.name.slice(0, 1)}
          </span>
        )}
        <span className="truncate text-body font-medium text-ink-900">{workspace.name}</span>
      </div>

      <div className="pb-2">
        <Link
          href="/admin/new"
          className="cta w-full bg-brand text-white shadow-lift active:scale-[0.98]"
        >
          <PlusIcon size={16} /> New
        </Link>
      </div>

      <div className="pb-3">
        <label className="relative block">
          <SearchIcon
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search clients"
            className="w-full rounded-lg border border-transparent bg-white/60 py-1.5 pl-8 pr-2 text-body outline-none placeholder:text-ink-400 focus:border-ink-200 focus:bg-panel"
          />
        </label>
      </div>

      <nav className="nav-list flex-1 overflow-y-auto pb-4">
        <SectionLabel>Workspace</SectionLabel>
        <NavItem href="/admin" icon={<HomeIcon size={15} />} active={pathname === "/admin"}>
          Home
        </NavItem>
        <NavItem
          href="/admin/content"
          icon={<CalendarDaysIcon size={15} />}
          active={pathname.startsWith("/admin/content")}
          badge={totalPending || undefined}
        >
          Content
        </NavItem>
        <NavItem
          href="/admin/ideas"
          icon={<IdeaIcon size={15} />}
          active={pathname.startsWith("/admin/ideas")}
        >
          Ideas
        </NavItem>
        <NavItem
          href="/admin/analytics"
          icon={<AnalyticsIcon size={15} />}
          active={pathname.startsWith("/admin/analytics")}
        >
          Analytics
        </NavItem>
        <NavItem
          href="/admin/appearance"
          icon={<SettingsIcon size={15} />}
          active={pathname.startsWith("/admin/appearance")}
        >
          Appearance
        </NavItem>

        <SectionLabel className="mt-5">Clients</SectionLabel>
        <ul className="nav-list">
          {shown.map((c) => {
            const expanded = open[c.slug] ?? false;
            const onClient = pathname.startsWith(`/admin/c/${c.slug}`);
            return (
              <li key={c.id}>
                <div
                  className={cn(
                    "nav-row group gap-1.5",
                    onClient ? "bg-panel font-medium text-ink-900 shadow-lift" : "hover:bg-white/60",
                  )}
                >
                  <ClientAvatar
                    id={c.id}
                    name={c.name}
                    color={c.brand_color}
                    hasLogo={c.hasLogo}
                    size={20}
                    rounded="rounded"
                  />
                  <Link href={`/admin/c/${c.slug}`} className="min-w-0 flex-1 truncate text-ink-900">
                    {c.name}
                  </Link>
                  {c.pending > 0 && (
                    <span className="shrink-0 rounded bg-warn-100 px-1 text-small font-medium text-warn-600">
                      {c.pending}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={expanded ? `Collapse ${c.name}` : `Expand ${c.name}`}
                    aria-expanded={expanded}
                    onClick={() => setOpen((p) => ({ ...p, [c.slug]: !expanded }))}
                    className="shrink-0 rounded p-0.5 text-ink-400 transition hover:text-ink-900"
                  >
                    <ChevronDownIcon
                      size={13}
                      className={cn("transition", expanded && "rotate-180")}
                    />
                  </button>
                </div>

                {expanded && (
                  <ul className="nav-list ml-4 mt-1 border-l border-ink-200 pl-2">
                    <SubItem
                      href={`/admin/c/${c.slug}`}
                      icon={<CalendarDaysIcon size={13} />}
                      active={pathname === `/admin/c/${c.slug}`}
                    >
                      Content
                    </SubItem>
                    <SubItem
                      href={`/admin/c/${c.slug}/strategy`}
                      icon={<StrategyIcon size={13} />}
                      active={pathname.startsWith(`/admin/c/${c.slug}/strategy`)}
                    >
                      Strategy
                    </SubItem>
                    <SubItem
                      href={`/admin/c/${c.slug}/performance`}
                      icon={<AnalyticsIcon size={13} />}
                      active={pathname.startsWith(`/admin/c/${c.slug}/performance`)}
                    >
                      Performance
                    </SubItem>
                    <SubItem
                      href={`/admin/c/${c.slug}/competitors`}
                      icon={<CompetitorIcon size={13} />}
                      active={pathname.startsWith(`/admin/c/${c.slug}/competitors`)}
                    >
                      Competitors
                    </SubItem>
                    <SubItem
                      href={`/admin/c/${c.slug}/settings`}
                      icon={<SettingsIcon size={13} />}
                      active={pathname.startsWith(`/admin/c/${c.slug}/settings`)}
                    >
                      Settings
                    </SubItem>
                    <SubItem
                      href={`/p/${c.portal_token}`}
                      icon={<LinkIcon size={13} />}
                      external
                    >
                      Portal
                    </SubItem>
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

    </aside>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mb-1 px-2 text-[10px] font-semibold uppercase text-ink-400",
        className,
      )}
    >
      {children}
    </p>
  );
}

function NavItem({
  href,
  icon,
  active,
  badge,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  active?: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    // Spec nav row: 32px tall, 8px padding, 8px radius.
    <Link
      href={href}
      className={cn(
        "nav-row",
        active
          ? "bg-panel font-medium text-ink-900 shadow-lift"
          : "text-ink-700 hover:bg-white/60",
      )}
    >
      <span className="text-ink-500">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {badge != null && (
        <span className="rounded bg-warn-100 px-1 text-small font-medium text-warn-600">
          {badge}
        </span>
      )}
    </Link>
  );
}

function SubItem({
  href,
  icon,
  active,
  external,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  active?: boolean;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={cn(
          "nav-row",
          active ? "bg-panel font-medium text-ink-900" : "text-ink-500 hover:bg-white/60",
        )}
      >
        <span className="text-ink-400">{icon}</span>
        <span className="flex-1 truncate">{children}</span>
        {external && <span className="text-small text-ink-400">↗</span>}
      </Link>
    </li>
  );
}
