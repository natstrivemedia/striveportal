import { listClients } from "@/lib/queries";
import { createItem } from "@/app/admin/actions";
import { redirect } from "next/navigation";

export const metadata = { title: "New post · Strive Media" };

/** Pick a client, name the thing, land in the composer. */
export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const clients = await listClients();
  if (clients.length === 0) redirect("/admin");

  const { client: preselected } = await searchParams;
  const thisMonth = new Date().toISOString().slice(0, 7);

  async function create(formData: FormData) {
    "use server";
    const slug = String(formData.get("slug") ?? "");
    await createItem(slug, formData);
  }

  return (
    <div className="mx-auto max-w-lg py-8">
      <h1 className="text-h1 font-bold text-ink-900">New post</h1>
      <p className="mt-1 text-body text-ink-500">
        This starts a private draft. Nothing reaches the client until you send it.
      </p>

      <form
        action={create}
        className="mt-6 flex flex-col gap-4 rounded-[20px] border border-ink-200 bg-white p-5 shadow-lift"
      >
        <label>
          <span className="mb-1 block text-small font-medium text-ink-500">Client</span>
          <select
            name="slug"
            defaultValue={preselected ?? clients[0].slug}
            className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-body outline-none focus:border-ink-900 focus:bg-white"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-small font-medium text-ink-500">Title</span>
          <input
            name="title"
            required
            autoFocus
            placeholder="Volunteer spotlight — Marcus"
            className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-small font-medium text-ink-500">Type</span>
            <select
              name="type"
              className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-body outline-none focus:border-ink-900 focus:bg-white"
            >
              <option value="post">Post</option>
              <option value="asset">Asset / doc</option>
            </select>
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-small font-medium text-ink-500">Month</span>
            <input
              type="month"
              name="month"
              defaultValue={thisMonth}
              className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-body outline-none focus:border-ink-900 focus:bg-white"
            />
          </label>
        </div>

        <button
          type="submit"
          className="mt-1 w-full rounded-full bg-ink-950 py-3 text-body font-semibold text-white transition active:scale-[0.99]"
        >
          Create and open
        </button>
      </form>
    </div>
  );
}
