import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { getClientBySlug, listCalendars, listAllItems } from "@/lib/queries";
import { portalUrl } from "@/lib/portal";
import {
  addContact,
  duplicateMonth,
  removeContact,
  removeLogo,
  sendCalendarForReview,
  setClientHandles,
  uploadLogo,
} from "@/app/admin/actions";
import { CopyLink } from "@/components/admin/CopyLink";
import { RotateToken } from "@/components/admin/RotateToken";
import { TimezonePicker } from "@/components/admin/TimezonePicker";
import { ClientAvatar } from "@/components/ClientAvatar";
import { NETWORK_LABEL } from "@/components/charts/palette";
import { PLATFORMS } from "@/lib/types";
import { formatMonth } from "@/lib/utils";

/** Everything about a client that isn't the calendar itself. */
export default async function ClientSettings({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const [contacts, calendars, items] = await Promise.all([
    sql<{ id: string; name: string; email: string }>`
      select id, name, email from client_contacts
      where client_id = ${client.id} order by name
    `,
    listCalendars(client.id),
    listAllItems(client.id),
  ]);

  return (
    <div
      className="mx-auto max-w-3xl"
      style={{ "--brand": client.brand_color } as React.CSSProperties}
    >
      <Link href={`/admin/c/${slug}`} className="text-small text-ink-500 hover:underline">
        ← {client.name}
      </Link>
      <h1 className="mt-1 text-h1 font-bold text-ink-900">Settings</h1>

      <Section
        title="Logo"
        note="Replaces the letter mark in the sidebar, on this page, and in their portal."
      >
        <div className="flex flex-wrap items-center gap-4">
          <ClientAvatar
            id={client.id}
            name={client.name}
            color={client.brand_color}
            hasLogo={Boolean(client.logo_path)}
            size={64}
          />
          <form action={uploadLogo.bind(null, slug)} className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              required
              className="text-body file:mr-3 file:rounded-full file:border-0 file:bg-ink-100 file:px-4 file:py-2 file:text-body file:font-semibold file:text-ink-700 hover:file:bg-ink-200"
            />
            <button
              type="submit"
              className="cta bg-ink-950 text-white transition active:scale-[0.98]"
            >
              Upload
            </button>
          </form>
          {client.logo_path && (
            <form action={removeLogo.bind(null, slug)}>
              <button
                type="submit"
                className="rounded-full px-3 py-2 text-small font-semibold text-ink-400 transition hover:bg-stop-100 hover:text-stop-600"
              >
                Remove
              </button>
            </form>
          )}
        </div>
      </Section>

      <Section
        title="Social handles"
        note="Shown on post cards and in previews, so a draft reads as the account it will publish from."
      >
        <form action={setClientHandles.bind(null, slug)} className="flex flex-wrap gap-3">
          {PLATFORMS.map((p) => (
            <label key={p} className="w-40">
              <span className="mb-1 block text-small font-medium text-ink-500">
                {NETWORK_LABEL[p] ?? p}
              </span>
              <input
                name={`handle_${p}`}
                defaultValue={client.handles?.[p] ?? ""}
                placeholder="@handle"
                className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white"
              />
            </label>
          ))}
          <div className="flex w-full">
            <button
              type="submit"
              className="cta border border-ink-200 text-ink-700 transition hover:bg-ink-100"
            >
              Save handles
            </button>
          </div>
        </form>
      </Section>

      <Section
        title="Timezone"
        note="Their schedule is rendered in this zone — in your calendar and in their portal."
      >
        <TimezonePicker slug={slug} timezone={client.timezone} />
      </Section>

      <Section
        title="Portal link"
        note="One permanent, unguessable URL. Anyone with it can review — rotate it if it leaks."
      >
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-100 px-3 py-2 text-small text-ink-700">
            {portalUrl(client.portal_token)}
          </code>
          <CopyLink url={portalUrl(client.portal_token)} />
          <RotateToken slug={slug} />
        </div>
      </Section>

      <Section
        title="Who gets the review email"
        note="Without a contact, sending for review won't email anybody."
      >
        {contacts.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-full bg-ink-100 py-1 pl-3 pr-1 text-small"
              >
                <span className="font-medium text-ink-900">{c.name}</span>
                <span className="text-ink-500">{c.email}</span>
                <form action={removeContact.bind(null, slug, c.id)}>
                  <button
                    type="submit"
                    aria-label={`Remove ${c.email}`}
                    className="rounded-full px-1.5 text-ink-400 transition hover:text-stop-600"
                  >
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addContact.bind(null, slug)} className="flex flex-wrap gap-2">
          <input
            name="name"
            placeholder="Name"
            className="w-32 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="them@example.com"
            className="min-w-[200px] flex-1 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
          <button
            type="submit"
            className="cta border border-ink-200 text-ink-700 transition hover:bg-ink-100"
          >
            Add contact
          </button>
        </form>
      </Section>

      <Section title="Months" note="Send a whole month for review, or copy it into the next one.">
        {calendars.length === 0 ? (
          <p className="text-body text-ink-400">No months yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {calendars.map((cal) => {
              const drafts = items.filter(
                (i) => i.calendar_id === cal.id && i.status === "draft",
              ).length;
              return (
                <li
                  key={cal.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-900">
                      {cal.title ?? formatMonth(cal.month)}
                    </p>
                    <p className="mt-0.5 text-small text-ink-500">
                      {cal.total} items · {cal.pending} pending · {cal.approved} approved
                    </p>
                  </div>
                  <form action={duplicateMonth.bind(null, slug, cal.id)}>
                    <button
                      type="submit"
                      className="rounded-full px-3 py-2 text-small font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                    >
                      Duplicate →
                    </button>
                  </form>
                  {drafts > 0 && (
                    <form action={sendCalendarForReview.bind(null, slug, cal.id)}>
                      <button
                        type="submit"
                        className="cta bg-brand text-[var(--brand-on,#fff)] transition active:scale-95"
                      >
                        Send {drafts} for review
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-[20px] border border-ink-200 bg-white p-5 shadow-lift">
      <h2 className="text-body font-semibold text-ink-900">{title}</h2>
      {note && <p className="mb-3 mt-0.5 text-small text-ink-500">{note}</p>}
      {children}
    </section>
  );
}
