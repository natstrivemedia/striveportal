import { sql } from "@/lib/db";
import { listClients } from "@/lib/queries";
import { createIdea } from "./actions";
import { IdeaCard } from "@/components/admin/IdeaCard";
import { EmptyState } from "@/components/ui";
import { IdeaIcon } from "@/components/icons";
import type { Idea } from "@/lib/types";

export const metadata = { title: "Ideas · Strive Media" };

type IdeaRow = Idea & { client_name: string | null; client_slug: string | null };

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; show?: string }>;
}) {
  const { scope = "all", show = "open" } = await searchParams;
  const clients = await listClients();

  const rows = await sql<IdeaRow>`
    select i.*, c.name as client_name, c.slug as client_slug
    from ideas i
    left join clients c on c.id = i.client_id
    order by i.created_at desc
  `;

  const visible = rows
    .filter((r) => (show === "all" ? true : r.status === show))
    .filter((r) =>
      scope === "all"
        ? true
        : scope === "shared"
          ? r.client_id === null
          : r.client_slug === scope,
    );

  const shared = visible.filter((r) => r.client_id === null);
  const perClient = visible.filter((r) => r.client_id !== null);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-h1 font-bold text-ink-900">Ideas</h1>
        <p className="mt-1 text-body text-ink-500">
          An evergreen bank you can pull from when a month looks thin. Clients never
          see the shared library.
        </p>
      </div>

      {/* Capture */}
      <form
        action={createIdea}
        className="mb-8 rounded-[20px] border border-ink-200 bg-white p-4 shadow-lift"
      >
        <div className="flex flex-wrap gap-2">
          <input
            name="title"
            required
            placeholder="Volunteer spotlight format — one person, one number, one quote"
            className="min-w-[260px] flex-1 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
          <select
            name="client_id"
            defaultValue=""
            className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white"
          >
            <option value="">Shared library</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="cta bg-ink-950 text-white transition active:scale-[0.98]"
          >
            Add idea
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            name="notes"
            placeholder="Notes — the angle, the hook, why it works"
            className="min-w-[260px] flex-1 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
          <input
            name="hashtags"
            placeholder="#hashtags"
            className="w-48 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
        </div>
      </form>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-body">
        <FilterLink label="All" href="/admin/ideas" active={scope === "all" && show === "open"} />
        <FilterLink label="Shared" href="/admin/ideas?scope=shared" active={scope === "shared"} />
        {clients.map((c) => (
          <FilterLink
            key={c.id}
            label={c.name}
            href={`/admin/ideas?scope=${c.slug}`}
            active={scope === c.slug}
          />
        ))}
        <span className="mx-1 text-ink-300">·</span>
        <FilterLink label="Used & archived" href="/admin/ideas?show=all" active={show === "all"} />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<IdeaIcon size={30} />}
          title="No ideas here yet"
          body="Drop anything reusable in — formats, hooks, recurring segments."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {shared.length > 0 && (
            <Group title={`Shared library · ${shared.length}`}>
              {shared.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} clients={clients} />
              ))}
            </Group>
          )}
          {perClient.length > 0 && (
            <Group title={`Client ideas · ${perClient.length}`}>
              {perClient.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} clients={clients} />
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-small font-semibold uppercase text-ink-500">
        {title}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">{children}</ul>
    </section>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      className={
        active
          ? "cta bg-ink-950 text-white"
          : "rounded-full bg-ink-100 px-3 py-1.5 text-small font-medium text-ink-700 transition hover:bg-ink-200"
      }
    >
      {label}
    </a>
  );
}
