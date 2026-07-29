"use client";

/**
 * Multi-select for sending a batch in one go.
 *
 * Selection lives here rather than in the URL: it is transient, and a link to
 * "these six posts selected" is not something anyone wants to share. Clicking a
 * post still opens it — you opt into selection with the checkboxes.
 */

import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SendIcon, CloseIcon } from "@/components/icons";
import { sendSelectedForReview } from "@/app/admin/actions";
import { useToast } from "@/components/toast";
import { plural } from "@/lib/utils";

type Ctx = {
  selected: Set<string>;
  toggle: (id: string) => void;
  selectable: boolean;
};

const SelectionContext = createContext<Ctx | null>(null);

export function useSelection() {
  return useContext(SelectionContext);
}

export function SelectionProvider({
  slug,
  sendableIds,
  children,
}: {
  slug: string;
  /** Posts eligible to be sent — drafts and client requests. */
  sendableIds: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const sendable = useMemo(() => new Set(sendableIds), [sendableIds]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const value = useMemo<Ctx>(
    () => ({ selected, toggle, selectable: sendable.size > 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, sendable],
  );

  function send() {
    startTransition(async () => {
      const res = await sendSelectedForReview(slug, [...selected]);
      if (!res.ok) {
        push({ message: res.error ?? "Couldn't send." });
        return;
      }
      setSelected(new Set());
      push({
        message: res.notified
          ? `${plural(res.sent, "post")} sent — one email`
          : `${plural(res.sent, "post")} sent — added to their existing link, no second email`,
        durationMs: 6000,
      });
      router.refresh();
    });
  }

  return (
    <SelectionContext.Provider value={value}>
      {children}

      {selected.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
          <div className="animate-toast pointer-events-auto flex items-center gap-3 rounded-full bg-ink-950 py-2.5 pl-5 pr-2.5 text-white shadow-pop">
            <span className="text-body font-medium">
              {plural(selected.size, "post")} selected
            </span>
            <button
              type="button"
              onClick={send}
              disabled={isPending}
              className="flex items-center gap-1.5 cta bg-white text-ink-950 transition active:scale-95 disabled:opacity-60"
            >
              <SendIcon size={14} />
              {isPending ? "Sending…" : "Send for approval"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="grid size-7 place-items-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white"
            >
              <CloseIcon size={15} />
            </button>
          </div>
        </div>
      )}
    </SelectionContext.Provider>
  );
}

/**
 * Checkbox for a selectable post. Rendered as a sibling of the post's link, so
 * it is an ordinary control — no click interception required.
 */
export function SelectBox({ id }: { id: string }) {
  const ctx = useSelection();
  if (!ctx) return null;

  return (
    <input
      type="checkbox"
      checked={ctx.selected.has(id)}
      onChange={() => ctx.toggle(id)}
      aria-label="Select post"
      className="size-4 shrink-0 cursor-pointer rounded border-ink-300 accent-ink-950"
    />
  );
}
