import Link from "next/link";
import { notFound } from "next/navigation";
import { PlusIcon, SettingsIcon } from "@/components/icons";
import { getClientBySlug, getItem, listAllItems, listComments } from "@/lib/queries";
import { saveItem, addAdminComment } from "@/app/admin/actions";
import { saveVariant } from "./calendar-actions";
import { sql } from "@/lib/db";
import { ActivityPanel } from "@/components/admin/ActivityPanel";
import type { Approval, CalendarEvent } from "@/lib/types";
import { CalendarProvider } from "@/components/calendar/CalendarInteractions";
import {
  MonthNav,
  ViewToggle,
  monthParam,
  parseMonth,
  parseView,
} from "@/components/calendar/Toolbar";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { GridView } from "@/components/calendar/GridView";
import { ListView } from "@/components/calendar/ListView";
import { ComposerModal, type ComposerValues } from "@/components/composer/ComposerModal";
import { NewPostButton } from "@/components/admin/NewPostButton";
import { SelectionProvider } from "@/components/admin/SelectionBar";
import { TimezonePicker } from "@/components/admin/TimezonePicker";
import { StatusTabs, filterByTab } from "@/components/calendar/StatusTabs";
import { ClientAvatar } from "@/components/ClientAvatar";
import { listPillars } from "@/lib/goals";
import { NETWORK_LABEL } from "@/components/charts/palette";

/** datetime-local wants 'YYYY-MM-DDTHH:mm' in local time. */
function toLocalInput(value: Date | string | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function ClientContent({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    view?: string;
    month?: string;
    post?: string;
    tab?: string;
  }>;
}) {
  const { slug } = await params;
  const { view: rawView, month: rawMonth, post, tab } = await searchParams;

  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const view = parseView(rawView);
  const { year, month } = parseMonth(rawMonth);
  const all = await listAllItems(client.id);

  // Scope the non-calendar views to the same month, so switching views never
  // silently changes which posts you're looking at.
  const monthFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: client.timezone,
    year: "numeric",
    month: "numeric",
  });
  const inMonth = all.filter((i) => {
    if (!i.scheduled_for) return false;
    const parts = monthFmt.formatToParts(new Date(i.scheduled_for));
    return (
      Number(parts.find((p) => p.type === "year")?.value) === year &&
      Number(parts.find((p) => p.type === "month")?.value) === month + 1
    );
  });
  const unscheduled = all.filter((i) => !i.scheduled_for);

  const base = `/admin/c/${slug}`;
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, month: monthParam(year, month), tab, ...over };
    for (const [k, val] of Object.entries(merged)) {
      if (val) p.set(k, val);
    }
    return `${base}?${p}`;
  };

  const pillars = await listPillars(client.id);
  const events = await sql<CalendarEvent>`
    select *, to_char(starts_on, 'YYYY-MM-DD') as starts_on,
           to_char(ends_on, 'YYYY-MM-DD') as ends_on
    from calendar_events where client_id = ${client.id}
  `;
  const openItem = post ? await getItem(client.id, post) : null;
  const [comments, approvals] = openItem
    ? await Promise.all([
        listComments(openItem.id),
        sql<Approval>`
          select * from approvals where item_id = ${openItem.id} order by created_at desc
        `,
      ])
    : [[], []];

  async function save(values: ComposerValues) {
    "use server";
    if (!post) return { ok: false, error: "No post open." };
    return saveItem(slug, post, values);
  }

  async function comment(formData: FormData) {
    "use server";
    if (!post) return;
    await addAdminComment(slug, post, String(formData.get("body") ?? ""));
  }

  async function saveChannelCaption(
    platform: string,
    caption: string,
    hashtags: string[],
  ) {
    "use server";
    if (!post) return { ok: false, error: "No post open." };
    return saveVariant(slug, post, platform, caption, hashtags);
  }

  const variantRows = openItem
    ? await sql<{ platform: string; caption: string; hashtags: string[] }>`
        select platform, caption, hashtags from item_variants
        where item_id = ${openItem.id}
      `
    : [];
  const variants = Object.fromEntries(
    variantRows.map((r) => [r.platform, { caption: r.caption, hashtags: r.hashtags }]),
  );

  const sendableIds = all
    .filter((i) => i.status === "draft" || i.status === "requested")
    .map((i) => i.id);

  return (
    <SelectionProvider slug={slug} sendableIds={sendableIds}>
    <div style={{ "--brand": client.brand_color } as React.CSSProperties}>
      {/* Client header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClientAvatar
            id={client.id}
            name={client.name}
            color={client.brand_color}
            hasLogo={Boolean(client.logo_path)}
            size={44}
          />
          <div>
            <h1 className="text-h2 font-bold text-ink-900">{client.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {[...new Set(all.flatMap((i) => i.platforms))].map((p) => (
                <span
                  key={p}
                  className="rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600"
                >
                  {NETWORK_LABEL[p] ?? p}
                </span>
              ))}
              {all.every((i) => i.platforms.length === 0) && (
                <span className="text-small text-ink-400">No platforms yet</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ViewToggle view={view} hrefFor={(v) => qs({ view: v })} />
          <Link
            href={`${base}/settings`}
            aria-label="Client settings"
            className="grid size-9 place-items-center rounded-xl text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <SettingsIcon size={17} />
          </Link>
          <NewPostButton slug={slug} month={monthParam(year, month)} view={view} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <MonthNav
          year={year}
          month={month}
          hrefFor={(y, m) => qs({ month: monthParam(y, m) })}
        />
        <TimezonePicker slug={slug} timezone={client.timezone} />
      </div>

      {view === "calendar" && (
        <CalendarProvider slug={slug}>
          <MonthCalendar
            year={year}
            month={month}
            items={all}
            timeZone={client.timezone}
            handle={Object.values(client.handles ?? {})[0] ?? null}
            events={events}
            slug={slug}
            hrefFor={(id) => qs({ post: id })}
          />
        </CalendarProvider>
      )}
      {view === "grid" && <GridView items={inMonth} hrefFor={(id) => qs({ post: id })} />}
      {view === "list" && (
        <>
          <div className="mb-4 border-b border-ink-200 pb-3">
            <StatusTabs
              items={inMonth}
              active={tab}
              hrefFor={(key) => qs({ tab: key })}
            />
          </div>
          <ListView
            items={filterByTab(inMonth, tab)}
            timeZone={client.timezone}
            hrefFor={(id) => qs({ post: id })}
            handles={client.handles}
            pillars={pillars}
            slug={slug}
          />
        </>
      )}

      {unscheduled.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-small font-semibold uppercase text-ink-500">
            Unscheduled
            <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-bold text-ink-500">
              {unscheduled.length}
            </span>
          </h2>
          <ListView
            items={unscheduled}
            timeZone={client.timezone}
            hrefFor={(id) => qs({ post: id })}
          />
        </section>
      )}

      {openItem && (
        <ComposerModal
          mode="admin"
          itemId={openItem.id}
          brandName={client.name}
          brandColor={client.brand_color}
          media={openItem.media}
          closeHref={qs({ post: undefined })}
          onSave={save}
          primaryLabel={openItem.status === "draft" ? "Send for approval" : "Save"}
          primarySetsStatus={openItem.status === "draft" ? "in_review" : undefined}
          initialTab={tab === "activity" ? "activity" : undefined}
          variants={variants}
          onSaveVariant={saveChannelCaption}
          activity={
            <ActivityPanel
              clientName={client.name}
              comments={comments}
              approvals={approvals}
              onComment={comment}
            />
          }
          pillars={pillars}
          handle={client.handles?.[openItem.platforms[0]] ?? null}
          initial={{
            title: openItem.title ?? "",
            caption: openItem.caption,
            platforms: openItem.platforms,
            hashtags: openItem.hashtags ?? [],
            labels: openItem.labels ?? [],
            format: openItem.format ?? "post",
            pillarId: openItem.pillar_id,
            scheduledFor: toLocalInput(openItem.scheduled_for),
            status: openItem.status,
            internalNote: openItem.internal_note ?? "",
          }}
        />
      )}
    </div>
    </SelectionProvider>
  );
}
