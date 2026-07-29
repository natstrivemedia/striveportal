import { timeAgo } from "@/lib/utils";
import type { Approval, Comment } from "@/lib/types";

/** Conversation + the append-only decision log, side by side in the composer. */
export function ActivityPanel({
  clientName,
  comments,
  approvals,
  onComment,
}: {
  clientName: string;
  comments: Comment[];
  approvals: Approval[];
  onComment: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-small font-semibold uppercase text-ink-500">
          Conversation
        </h3>
        <ul className="mb-3 flex flex-col gap-2">
          {comments.length === 0 && (
            <li className="rounded-xl border border-dashed border-ink-200 p-4 text-center text-body text-ink-400">
              No comments yet
            </li>
          )}
          {comments.map((c) => (
            <li
              key={c.id}
              className={
                c.author_type === "admin"
                  ? "rounded-xl border border-ink-200 bg-white p-3"
                  : "rounded-xl bg-brand-soft p-3"
              }
            >
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-small font-semibold text-ink-900">
                  {c.author_type === "admin" ? "Strive Media" : c.author_name || clientName}
                </span>
                <span className="text-small text-ink-400">{timeAgo(c.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-body text-ink-700">{c.body}</p>
            </li>
          ))}
        </ul>

        <form action={onComment} className="flex gap-2">
          <input
            name="body"
            placeholder="Reply to the client…"
            className="min-w-0 flex-1 rounded-full border border-ink-200 bg-white px-4 py-2 text-body outline-none focus:border-ink-900"
          />
          <button
            type="submit"
            className="shrink-0 cta bg-ink-950 text-white"
          >
            Send
          </button>
        </form>
      </section>

      <section>
        <h3 className="mb-2 text-small font-semibold uppercase text-ink-500">
          Approval history
        </h3>
        {approvals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 p-4 text-center text-body text-ink-400">
            No decisions recorded yet
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {approvals.map((a) => (
              <li key={a.id} className="rounded-xl border border-ink-200 bg-white p-3 text-body">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink-900">
                    {a.decision === "approved" && "Approved"}
                    {a.decision === "changes_requested" && "Changes requested"}
                    {a.decision === "undone" && "Approval undone"}
                  </span>
                  <span className="text-small text-ink-400">{timeAgo(a.created_at)}</span>
                </div>
                <p className="mt-0.5 text-small text-ink-500">
                  {a.actor === "admin_on_behalf"
                    ? "by Strive Media, on the client's behalf"
                    : `by the client${a.ip ? ` · ${a.ip}` : ""}`}
                </p>
                {a.note && <p className="mt-1.5 text-body text-ink-700">{a.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
