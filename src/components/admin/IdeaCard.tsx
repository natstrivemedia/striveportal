"use client";

import { useState, useTransition } from "react";
import { BookIcon, ArrowRightIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import { deleteIdea, promoteIdea, setIdeaStatus } from "@/app/admin/ideas/actions";
import { cn, timeAgo } from "@/lib/utils";
import type { Client, Idea } from "@/lib/types";

type IdeaRow = Idea & { client_name: string | null; client_slug: string | null };

/**
 * An idea is only worth banking if turning it into a post is trivial — so
 * "Use for…" is on the card itself, one step from concept to a real draft.
 */
export function IdeaCard({ idea, clients }: { idea: IdeaRow; clients: Client[] }) {
  const [isPending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);

  const spent = idea.status !== "open";

  return (
    <li
      className={cn(
        "flex flex-col rounded-[20px] border border-ink-200 bg-white p-4 transition",
        spent && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">{idea.title}</p>
          <p className="mt-0.5 text-small text-ink-400">
            {idea.client_name ?? "Shared library"} · {timeAgo(idea.created_at)}
            {idea.status === "used" && " · used"}
            {idea.status === "archived" && " · archived"}
          </p>
        </div>
      </div>

      {idea.notes && (
        <p className="mt-2 whitespace-pre-wrap text-body leading-relaxed text-ink-700">
          {idea.notes}
        </p>
      )}

      {idea.hashtags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {idea.hashtags.map((h) => (
            <span
              key={h}
              className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-500"
            >
              #{h}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-ink-100 pt-3">
        {picking ? (
          <select
            autoFocus
            defaultValue=""
            disabled={isPending}
            onChange={(e) => {
              const clientId = e.target.value;
              if (!clientId) return;
              startTransition(async () => {
                await promoteIdea(idea.id, clientId);
              });
            }}
            onBlur={() => setPicking(false)}
            className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-small outline-none"
          >
            <option value="">Use for which client?</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => {
              // A client-scoped idea already knows its target — skip the picker.
              if (idea.client_id) {
                startTransition(async () => {
                  await promoteIdea(idea.id, idea.client_id!);
                });
              } else {
                setPicking(true);
              }
            }}
            disabled={isPending}
            className="inline-flex items-center gap-1 cta bg-ink-100 text-ink-700 transition hover:bg-ink-200 disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Use this"} <ArrowRightIcon size={12} />
          </button>
        )}

        <span className="flex-1" />

        {idea.status === "open" ? (
          <button
            type="button"
            aria-label="Archive"
            onClick={() => startTransition(async () => setIdeaStatus(idea.id, "archived"))}
            className="rounded-full p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <BookIcon size={13} />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Reopen"
            onClick={() => startTransition(async () => setIdeaStatus(idea.id, "open"))}
            className="rounded-full p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <RefreshIcon size={13} />
          </button>
        )}

        <button
          type="button"
          aria-label="Delete"
          onClick={() => startTransition(async () => deleteIdea(idea.id))}
          className="rounded-full p-1.5 text-ink-400 transition hover:bg-stop-100 hover:text-stop-600"
        >
          <TrashIcon size={13} />
        </button>
      </div>
    </li>
  );
}
