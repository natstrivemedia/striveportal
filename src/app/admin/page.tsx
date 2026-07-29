import Link from "next/link";
import { ArrowRightIcon, ClockIcon, CheckIcon, IdeaIcon, EditIcon, AddUserIcon } from "@/components/icons";
import {
  contentStatus,
  greeting,
  staleItems,
  upcomingContent,
  STALE_AFTER_DAYS,
  type DashRow,
} from "@/lib/dashboard";
import { listClients } from "@/lib/queries";
import { StatusPill } from "@/components/ui";
import { formatDate, plural, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata = { title: "Home · Strive Media" };

const TZ = process.env.ADMIN_TZ ?? "America/New_York";

/** Order and colour of the pipeline breakdown. */
const BUCKETS: { key: string; label: string; dot: string; bar: string }[] = [
  { key: "draft", label: "Drafts", dot: "bg-ink-400", bar: "bg-ink-400" },
  { key: "in_review", label: "Client review", dot: "bg-warn-600", bar: "bg-warn-600" },
  { key: "requested", label: "Client requests", dot: "bg-brand", bar: "bg-brand" },
  { key: "changes_requested", label: "Revisions", dot: "bg-stop-600", bar: "bg-stop-600" },
  { key: "approved", label: "Approved", dot: "bg-ok-600", bar: "bg-ok-600" },
  { key: "scheduled", label: "Scheduled", dot: "bg-ink-700", bar: "bg-ink-700" },
];

export default async function Home() {
  const [stale, status, upcoming, clients] = await Promise.all([
    staleItems(),
    contentStatus(),
    upcomingContent(),
    listClients(),
  ]);

  const name = process.env.ADMIN_NAME ?? "there";
  const firstClient = clients[0]?.slug;

  return (
    <div className="mx-auto max-w-4xl py-6">
      <header className="text-center">
        <h1 className="text-h1 font-bold text-ink-900">
          {greeting(TZ)}, {name} <span aria-hidden>👋</span>
        </h1>

        <nav className="stagger mt-6 flex flex-wrap justify-center gap-3">
          <Quick
            href={firstClient ? `/admin/new?client=${firstClient}` : "/admin/new"}
            icon={<EditIcon size={15} className="text-brand" />}
          >
            Create new post
          </Quick>
          <Quick href="/admin/ideas" icon={<IdeaIcon size={15} className="text-warn-600" />}>
            Capture an idea
          </Quick>
          <Quick href="/admin/clients/new" icon={<AddUserIcon size={15} className="text-ok-600" />}>
            Add new client
          </Quick>
        </nav>
      </header>

      <div className="stagger mt-10 grid gap-4 md:grid-cols-2">
        {/* Stale */}
        <Card title="Stale items" href="/admin/content">
          {stale.length === 0 ? (
            <Empty
              icon={<CheckIcon size={26} className="text-ok-600" />}
              title="All caught up"
              body={`Nothing has been waiting more than ${plural(STALE_AFTER_DAYS, "day")}.`}
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {stale.map((r) => (
                <Row key={r.id} row={r} meta={`waiting ${timeAgo(r.updated_at)}`} />
              ))}
            </ul>
          )}
        </Card>

        {/* Content status */}
        <Card title="Content status" href="/admin/content">
          <div className="p-5">
            <p className="flex items-baseline gap-2">
              <span className="text-h1 font-bold text-ink-900">
                {status.total}
              </span>
              <span className="text-body text-ink-500">this month</span>
            </p>

            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink-200">
              {status.total > 0 &&
                BUCKETS.map((b) =>
                  status[b.key] ? (
                    <span
                      key={b.key}
                      className={cn("h-full", b.bar)}
                      style={{ width: `${(status[b.key] / status.total) * 100}%` }}
                      title={`${b.label}: ${status[b.key]}`}
                    />
                  ) : null,
                )}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
              {BUCKETS.map((b) => (
                <div key={b.key} className="flex items-center gap-2 text-body">
                  <span className={cn("size-2 shrink-0 rounded-full", b.dot)} />
                  <dt className="flex-1 text-ink-700">{b.label}</dt>
                  <dd className="font-medium tabular-nums text-ink-900">
                    {status[b.key] ?? 0}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
      </div>

      {/* Upcoming */}
      <div className="mt-4">
        <Card title="Upcoming content" href="/admin/content">
          {upcoming.length === 0 ? (
            <Empty
              icon={<ClockIcon size={26} className="text-ink-400" />}
              title="Nothing scheduled yet"
              body="Approved and scheduled posts will appear here."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {upcoming.map((r) => (
                <Row
                  key={r.id}
                  row={r}
                  meta={formatDate(
                    r.scheduled_for,
                    { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
                    r.timezone,
                  )}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Quick({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-2.5 text-body font-medium text-ink-900 shadow-lift transition hover:border-ink-400 active:scale-[0.98]"
    >
      {icon}
      {children}
    </Link>
  );
}

function Card({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-flush">
      <div className="flex items-center justify-between px-5 py-3.5">
        <h2 className="text-body font-medium text-ink-900">{title}</h2>
        <Link
          href={href}
          aria-label={`Open ${title}`}
          className="grid size-7 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
        >
          <ArrowRightIcon size={16} />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Empty({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon}
      <p className="mt-3 text-body font-semibold text-ink-900">{title}</p>
      <p className="mt-1 text-body text-ink-500">{body}</p>
    </div>
  );
}

function Row({ row, meta }: { row: DashRow; meta: string }) {
  return (
    <li>
      <Link
        href={`/admin/c/${row.client_slug}?post=${row.id}`}
        className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50"
      >
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white"
          style={{ background: row.brand_color }}
          title={row.client_name}
        >
          {row.client_name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-ink-900">
            {row.title || row.caption.split("\n")[0] || "Untitled"}
          </span>
          <span className="block truncate text-small text-ink-500">
            {row.client_name} · {meta}
          </span>
        </span>
        <StatusPill status={row.status} audience="admin" />
      </Link>
    </li>
  );
}
