import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import { requireClient } from "@/lib/portal";
import { listClientVisibleItems } from "@/lib/queries";
import { ApproveAllButton } from "@/components/portal/ApproveAllButton";
import { StatusPill, PlatformChips } from "@/components/ui";
import { formatDate, plural } from "@/lib/utils";
import type { ItemWithMedia } from "@/lib/types";

export default async function PortalHome({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  const client = await requireClient(token);
  const items = await listClientVisibleItems(client.id);

  const pending = items.filter((i) => i.status === "in_review");
  // The client's own submissions sit apart — nothing is being asked of them here.
  const requested = items.filter((i) => i.status === "requested");
  const settled = items.filter(
    (i) => i.status !== "in_review" && i.status !== "requested",
  );

  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6">
        {pending.length > 0 ? (
          <section className="animate-rise rounded-[20px] bg-brand p-6 text-[var(--brand-on)] shadow-lift">
            <h1 className="text-h1 font-bold">
              {plural(pending.length, "post")} waiting on you
            </h1>
            <p className="mt-1 text-body opacity-80">
              One tap each. You can undo straight after.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Link
                href={`/p/${token}/i/${pending[0].id}`}
                className="rounded-full bg-white px-6 py-3.5 text-center text-body font-semibold text-ink-950 shadow-lift transition active:scale-[0.98]"
              >
                Start reviewing
              </Link>
              {pending.length > 1 && <ApproveAllButton token={token} count={pending.length} />}
            </div>
          </section>
        ) : (
          <section className="animate-rise flex flex-col items-center rounded-[20px] border border-ink-200 bg-white px-6 py-12 text-center shadow-lift">
            <CheckIcon className="text-ok-600" size={44} strokeWidth={1.5} />
            <h1 className="mt-3 text-h2 font-bold text-ink-900">
              {done ? "That's everything — thank you" : "You're all caught up"}
            </h1>
            <p className="mt-1 text-body text-ink-500">
              We&apos;ll email you the moment there&apos;s something new.
            </p>
          </section>
        )}

        {requested.length > 0 && (
          <Section title="Your requests — with Strive Media">
            <ul className="flex flex-col gap-2">
              {requested.map((item) => (
                <ItemRow key={item.id} item={item} token={token} timeZone={client.timezone} />
              ))}
            </ul>
          </Section>
        )}

        {pending.length > 0 && (
          <Section title="Waiting on you">
            <ul className="flex flex-col gap-2">
              {pending.map((item) => (
                <ItemRow key={item.id} item={item} token={token} timeZone={client.timezone} />
              ))}
            </ul>
          </Section>
        )}

        {settled.length > 0 && (
          <Section title="Everything else">
            <ul className="flex flex-col gap-2">
              {settled.map((item) => (
                <ItemRow key={item.id} item={item} token={token} timeZone={client.timezone} />
              ))}
            </ul>
          </Section>
        )}
      </main>
    </>
  );
}

/** Children supply their own container — some sections are lists, some aren't. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 px-1 text-small font-semibold uppercase text-ink-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ItemRow({
  item,
  token,
  timeZone,
}: {
  item: ItemWithMedia;
  token: string;
  /** Scheduled times are stored in UTC. Rendering them in the client's own
   *  timezone stops "July 3" from showing up as July 2 on their phone. */
  timeZone: string;
}) {
  const thumb = item.media[0];
  return (
    <li>
      <Link
        href={`/p/${token}/i/${item.id}`}
        className="flex items-center gap-3 rounded-[20px] border border-ink-200 bg-white p-3 transition hover:border-brand-ring hover:shadow-lift"
      >
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink-100 text-small font-medium text-ink-400">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/media/${thumb.id}?t=${encodeURIComponent(token)}`}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            item.type === "asset" ? "DOC" : "—"
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-ink-900">
            {item.title || item.caption.split("\n")[0] || "Untitled"}
          </span>
          <span className="mt-1 flex items-center gap-2">
            {item.scheduled_for && (
              <span className="text-small text-ink-500">
                {formatDate(item.scheduled_for, { month: "short", day: "numeric" }, timeZone)}
              </span>
            )}
            <PlatformChips platforms={item.platforms} />
          </span>
        </span>

        <StatusPill status={item.status} />
      </Link>
    </li>
  );
}
