import Link from "next/link";
import { requireClient } from "@/lib/portal";
import { listCalendars } from "@/lib/queries";
import { EmptyState } from "@/components/ui";
import { formatMonth, plural } from "@/lib/utils";
import { CalendarDaysIcon } from "@/components/icons";

export const metadata = { title: "Content", robots: { index: false } };

/** Month index. Each month opens the calendar grid at /p/<token>/m/<id>. */
export default async function PortalContent({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await requireClient(token);
  const calendars = (await listCalendars(client.id)).filter((c) => c.total > 0);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6">
      <h1 className="mb-1 text-h2 font-bold text-ink-900">Content calendar</h1>
      <p className="mb-5 text-body text-ink-500">Everything planned, month by month.</p>

      {calendars.length === 0 ? (
        <EmptyState
          icon={<CalendarDaysIcon size={30} />}
          title="Nothing scheduled yet"
          body="Once Strive Media plans your first month it'll show up here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {calendars.map((cal) => (
            <li key={cal.id}>
              <Link
                href={`/p/${token}/m/${cal.id}`}
                className="flex items-center gap-4 rounded-[20px] border border-ink-200 bg-white p-4 transition hover:border-brand-ring"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-ink-700">
                  <CalendarDaysIcon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink-900">
                    {cal.title ?? formatMonth(cal.month)}
                  </span>
                  <span className="mt-0.5 block text-small text-ink-500">
                    {plural(cal.total, "post")} · {cal.approved} approved
                    {cal.changes > 0 && ` · ${cal.changes} need changes`}
                  </span>
                </span>
                {cal.pending > 0 && (
                  <span className="shrink-0 cta bg-warn-100 text-warn-600">
                    {cal.pending} waiting
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
