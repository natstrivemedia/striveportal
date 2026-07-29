"use client";

/**
 * The approval control. This component is the whole point of the product, so
 * the interaction budget is tight:
 *
 *   - Approve is ONE tap. No confirmation dialog — an Undo toast covers mistakes
 *     at zero cost, where a confirm step would tax every single approval.
 *   - Approving advances straight to the next pending item, so a client reviewing
 *     six posts taps six times total.
 *   - Typing is required in exactly one place: Request changes, where the note is
 *     the entire deliverable.
 *   - The buttons are pinned above the safe area, thumb-height on a phone.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckIcon, MessageIcon, CloseIcon } from "@/components/icons";
import { approveItem, requestChanges, undoApproval, type ActionResult } from "@/app/p/[token]/actions";
import { useToast } from "@/components/toast";
import type { ItemStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ApproveBar({
  token,
  itemId,
  status,
}: {
  token: string;
  itemId: string;
  status: ItemStatus;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  function advance(res: Extract<ActionResult, { ok: true }>) {
    router.push(
      res.nextItemId ? `/p/${token}/i/${res.nextItemId}` : `/p/${token}?done=1`,
    );
    router.refresh();
  }

  function onApprove() {
    startTransition(async () => {
      const res = await approveItem(token, itemId);
      if (!res.ok) {
        push({ message: res.error });
        return;
      }
      push({
        message: res.pendingLeft > 0 ? "Approved" : "Approved — that's everything",
        actionLabel: "Undo",
        onAction: () =>
          startTransition(async () => {
            await undoApproval(token, itemId);
            router.push(`/p/${token}/i/${itemId}`);
            router.refresh();
          }),
      });
      advance(res);
    });
  }

  function onRequestChanges() {
    startTransition(async () => {
      const res = await requestChanges(token, itemId, note);
      if (!res.ok) {
        setNoteError(res.error);
        return;
      }
      setSheetOpen(false);
      setNote("");
      setNoteError(null);
      push({ message: "Sent to Strive Media" });
      advance(res);
    });
  }

  const settled = status === "approved" || status === "changes_requested";

  return (
    <>
      <div className="sticky bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur safe-bottom">
        <div className="mx-auto flex max-w-2xl gap-3 px-4 pt-3">
          {settled ? (
            <>
              <div
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3.5 text-body font-semibold",
                  status === "approved"
                    ? "bg-ok-100 text-ok-600"
                    : "bg-stop-100 text-stop-600",
                )}
              >
                {status === "approved" ? <CheckIcon size={18} /> : <MessageIcon size={18} />}
                {status === "approved" ? "Approved" : "Changes requested"}
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                disabled={isPending}
                className="shrink-0 cta border border-ink-200 text-ink-700 transition hover:bg-ink-100 disabled:opacity-50"
              >
                {status === "approved" ? "Change my mind" : "Add a note"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                disabled={isPending}
                className="shrink-0 rounded-full border border-ink-200 bg-white px-5 py-3.5 text-body font-semibold text-ink-700 transition hover:bg-ink-100 active:scale-[0.98] disabled:opacity-50"
              >
                Request changes
              </button>
              <button
                type="button"
                onClick={onApprove}
                disabled={isPending}
                className="flex flex-1 items-center justify-center gap-2 cta bg-brand text-[var(--brand-on)] shadow-lift transition active:scale-[0.98] disabled:opacity-60"
              >
                <CheckIcon size={20} strokeWidth={2.5} />
                Approve
              </button>
            </>
          )}
        </div>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-ink-950/40"
          />
          <div className="animate-rise relative w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-pop sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-body font-semibold text-ink-900">
                What should we change?
              </h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-full p-1.5 text-ink-500 transition hover:bg-ink-100"
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <textarea
              autoFocus
              rows={4}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (noteError) setNoteError(null);
              }}
              placeholder="Swap the second photo, and can we say 'families' instead of 'clients'?"
              className="w-full resize-none rounded-2xl border border-ink-200 bg-ink-50 p-3.5 text-body text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand focus:bg-white"
            />
            {noteError && <p className="mt-2 text-body text-stop-600">{noteError}</p>}

            <button
              type="button"
              onClick={onRequestChanges}
              disabled={isPending}
              className="mt-3 w-full rounded-full bg-ink-950 py-3.5 text-body font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
            >
              Send to Strive Media
            </button>
          </div>
        </div>
      )}
    </>
  );
}
