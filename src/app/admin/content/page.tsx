import Link from "next/link";
import { sql } from "@/lib/db";
import { listClients } from "@/lib/queries";
import { StatusPill, PlatformChips, EmptyState } from "@/components/ui";
import { formatDate, plural } from "@/lib/utils";
import { CalendarDaysIcon } from "@/components/icons";
import type { ItemStatus } from "@/lib/types";

export const metadata = { title: "Content · Strive Media" };

type Row = {
  id: string;
  title: string | null;
  caption: string;
  status: ItemStatus;
  platforms: string[];
  scheduled_for: Date | null;
  created_by: "admin" | "client";
  client_name: string;
  client_slug: string;
  brand_color: string;
  timezone: string;
};

/**
 * Every client on one timeline.
 *
 * Opens with what is actually blocked on Strive — client requests and posts
 * sent back for changes — because those are the things that stall a month.
 */
export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: clientFilter } = await searchParams;
  const clients = await listClients();

  const rows = await sql<Row>`
    select i.id, i.title, i.caption, i.status, i.platforms, i.scheduled_for,
           i.created_by,
           c.name as client_name, c.slug as client_slug,
           c.brand_color, c.timezone
    from items i
    join clients c on c.id = i.client_id
    where c.archived_at is null
    order by i.scheduled_for nulls last, i.position, i.created_at
  `;

  const visible = clientFilter ? rows.filter((r) => r.client_slug === clientFilter) : rows;

  const needsUs = visible.filter(
    (r) => r.status === "requested" || r.status === "changes_requested",
  );
  const awaitingClient = visible.filter((r) => r.status === "in_review");
  const drafts = visible.filter((r) => r.status === "draft");
  const settled = visible.filter((r) =>
    ["approved", "scheduled", "published"].includes(r.status),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-h1 font-bold text-ink-900">Content</h1>
        <p className="mt-1 text-body text-ink-500">
          {plural(visible.length, "post")} across{" "}
          {clientFilter ? "1 client" : plural(clients.length, "client")}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Chip label="All clients" href="/admin/content" active={!clientFilter} />
        {clients.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            href={`/admin/content?client=${c.slug}`}
            active={clientFilter === c.slug}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<CalendarDaysIcon size={30} />}
          title="Nothing planned yet"
          body="Create a post from a client's page to get a month started."
        />
      ) : (
        <div className="flex flex-col gap-8">
          <Group title="Needs you" rows={needsUs} tone="warn" />
          <Group title="Awaiting the client" rows={awaitingClient} />
          <Group title="Drafts" rows={drafts} />
          <Group title="Locked in" rows={settled} />
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: Row[];
  tone?: "warn";
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-small font-semibold uppercase text-ink-500">
        {title}
        <span
          className={
            tone === "warn"
              ? "rounded-full bg-warn-100 px-1.5 text-[10px] font-bold text-warn-600"
              : "rounded-full bg-ink-100 px-1.5 text-[10px] font-bold text-ink-500"
          }
        >
          {rows.length}
        </span>
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/c/${r.client_slug}/i/${r.id}`}
              className="flex items-center gap-3 rounded-[20px] border border-ink-200 bg-white p-3 transition hover:border-ink-400"
            >
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-lg text-small font-bold text-white"
                style={{ background: r.brand_color }}
                title={r.client_name}
              >
                {r.client_name.slice(0, 1)}
              </span>
              <span className="w-12 shrink-0 text-center">
                {r.scheduled_for ? (
                  <>
                    <span className="block text-[10px] uppercase text-ink-400">
                      {formatDate(r.scheduled_for, { month: "short" }, r.timezone)}
                    </span>
                    <span className="block text-body font-bold text-ink-900">
                      {formatDate(r.scheduled_for, { day: "numeric" }, r.timezone)}
                    </span>
                  </>
                ) : (
                  <span className="text-small text-ink-300">—</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold text-ink-900">
                  {r.title || r.caption.split("\n")[0] || "Untitled"}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="text-small text-ink-500">{r.client_name}</span>
                  <PlatformChips platforms={r.platforms} />
                </span>
              </span>
              {r.created_by === "client" && (
                <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-ink-700">
                  their idea
                </span>
              )}
              <StatusPill status={r.status} audience="admin" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "cta bg-ink-950 text-white"
          : "rounded-full bg-ink-100 px-3 py-1.5 text-small font-medium text-ink-700 transition hover:bg-ink-200"
      }
    >
      {label}
    </Link>
  );
}
