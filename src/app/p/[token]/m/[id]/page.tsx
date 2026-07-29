import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/portal";
import { getCalendar, listItemsInCalendar } from "@/lib/queries";
import { listPillars } from "@/lib/goals";
import { ApproveAllButton } from "@/components/portal/ApproveAllButton";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { GridView } from "@/components/calendar/GridView";
import { ListView } from "@/components/calendar/ListView";
import { ViewToggle, parseView } from "@/components/calendar/Toolbar";
import { GlobeIcon } from "@/components/icons";
import { CLIENT_VISIBLE_STATUSES } from "@/lib/types";
import { formatMonth, parseMonth as parseMonthValue, plural } from "@/lib/utils";

/**
 * The client's month.
 *
 * The same calendar Strive works in, minus the drafts — so when you and the
 * client talk about "the 14th", you are both looking at the same grid.
 */
export default async function MonthView({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token, id } = await params;
  const { view: rawView } = await searchParams;
  const view = parseView(rawView);

  const client = await requireClient(token);
  const calendar = await getCalendar(client.id, id);
  if (!calendar) notFound();

  const [all, pillars] = await Promise.all([
    listItemsInCalendar(client.id, calendar.id),
    listPillars(client.id),
  ]);
  const items = all.filter((i) => CLIENT_VISIBLE_STATUSES.includes(i.status));
  const pending = items.filter((i) => i.status === "in_review");

  const monthStart = parseMonthValue(calendar.month);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();

  const base = `/p/${token}/m/${id}`;
  const hrefFor = (itemId: string) => `/p/${token}/i/${itemId}`;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/p/${token}/content`} className="text-small text-ink-500 hover:underline">
            ← All months
          </Link>
          <h1 className="mt-0.5 text-h2 font-bold text-ink-900">
            {calendar.title ?? formatMonth(calendar.month)}
          </h1>
          <p className="mt-0.5 text-body text-ink-500">
            {plural(items.length, "post")}
            {pending.length > 0 && ` · ${pending.length} waiting on you`}
          </p>
        </div>
        <ViewToggle view={view} hrefFor={(v) => `${base}?view=${v}`} />
      </div>

      {pending.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-brand p-4 text-[var(--brand-on)] shadow-lift">
          <p className="text-body font-medium">
            Happy with the whole month? You can still open any post first.
          </p>
          <ApproveAllButton token={token} count={pending.length} calendarId={calendar.id} />
        </div>
      )}

      {/* No month stepper here: a client's months are a short list, not an
          infinite scroll, and the Content tab already enumerates them. Arrows
          that go nowhere are worse than no arrows. */}
      <p className="mb-2 flex items-center gap-1.5 text-[13px] text-ink-500">
        <GlobeIcon size={14} />
        Times shown in {client.timezone.split("/").pop()?.replace(/_/g, " ")}
      </p>

      {view === "calendar" && (
        <MonthCalendar
          year={year}
          month={month}
          items={items}
          timeZone={client.timezone}
          hrefFor={hrefFor}
        />
      )}
      {view === "grid" && (
        <GridView items={items} hrefFor={hrefFor} mediaToken={token} audience="client" />
      )}
      {view === "list" && (
        <ListView
          items={items}
          hrefFor={hrefFor}
          timeZone={client.timezone}
          mediaToken={token}
          handles={client.handles}
          pillars={pillars}
        />
      )}
    </main>
  );
}
