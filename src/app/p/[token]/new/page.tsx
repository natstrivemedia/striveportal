import Link from "next/link";
import { requireClient } from "@/lib/portal";
import { listClientVisibleItems } from "@/lib/queries";
import { NewRequestButton } from "@/components/portal/NewRequestButton";
import { EditIcon } from "@/components/icons";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "New post", robots: { index: false } };

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await requireClient(token);

  const items = await listClientVisibleItems(client.id);
  const mine = items.filter((i) => i.status === "requested");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6">
      <div className="rounded-[20px] bg-brand p-6 text-[var(--brand-on)] shadow-lift">
        <h1 className="text-h2 font-bold">Got an idea?</h1>
        <p className="mt-1 text-body opacity-85">
          Write it up and send it over. We&apos;ll polish it and send it back for your
          approval — nothing goes out until you say so.
        </p>
        <div className="mt-5">
          <NewRequestButton token={token} />
        </div>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 px-1 text-small font-semibold uppercase text-ink-500">
          Your drafts
        </h2>
        {mine.length === 0 ? (
          <div className="flex flex-col items-center rounded-[20px] border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
            <EditIcon size={28} className="mb-3 text-ink-400" />
            <p className="text-body font-semibold text-ink-900">Nothing drafted yet</p>
            <p className="mt-1 text-body text-ink-500">
              Anything you write shows up here until we pick it up.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/p/${token}/new/${item.id}`}
                  className="flex items-center gap-3 rounded-[20px] border border-ink-200 bg-white p-3 transition hover:border-brand-ring"
                >
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink-100 text-small text-ink-400">
                    {item.media[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/media/${item.media[0].id}?t=${encodeURIComponent(token)}`}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold text-ink-900">
                      {item.title || item.caption.split("\n")[0] || "Untitled"}
                    </span>
                    <span className="mt-0.5 block text-small text-ink-500">
                      {item.scheduled_for
                        ? `for ${formatDate(item.scheduled_for, { month: "short", day: "numeric" }, client.timezone)}`
                        : "no date yet"}
                    </span>
                  </span>
                  <span className="shrink-0 text-small font-semibold text-ink-500">Edit</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
