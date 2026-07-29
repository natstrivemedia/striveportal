"use client";

import { useState, useTransition } from "react";
import { addComment } from "@/app/p/[token]/actions";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { timeAgo, cn } from "@/lib/utils";
import type { Comment } from "@/lib/types";

/**
 * Comments are deliberately secondary: collapsed to a single line until the
 * client chooses to say something, so the default path to "approved" never
 * routes past a text box.
 */
export function CommentThread({
  token,
  itemId,
  comments,
}: {
  token: string;
  itemId: string;
  comments: Comment[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(comments.length > 0);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await addComment(token, itemId, body);
      if (!res.ok) {
        push({ message: res.error ?? "Couldn't send that." });
        return;
      }
      setBody("");
      push({ message: "Comment added" });
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-[20px] border border-dashed border-ink-200 py-3 text-body font-medium text-ink-500 transition hover:border-brand-ring hover:text-ink-900"
      >
        Add a comment
      </button>
    );
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-small font-semibold uppercase text-ink-500">
        Comments
      </h2>

      <ul className="flex flex-col gap-2">
        {comments.map((c) => (
          <li
            key={c.id}
            className={cn(
              "rounded-[20px] border p-3",
              c.author_type === "admin"
                ? "border-ink-200 bg-white"
                : "border-transparent bg-brand-soft",
            )}
          >
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-small font-semibold text-ink-900">
                {c.author_type === "admin" ? "Strive Media" : c.author_name || "You"}
              </span>
              <span className="text-small text-ink-400">{timeAgo(c.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap text-body leading-relaxed text-ink-700">
              {c.body}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && body.trim()) submit();
          }}
          placeholder="Add a comment…"
          className="min-w-0 flex-1 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-body outline-none placeholder:text-ink-400 focus:border-brand"
        />
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !body.trim()}
          className="shrink-0 cta bg-ink-950 text-white transition disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </section>
  );
}
