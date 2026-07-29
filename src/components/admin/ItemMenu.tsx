"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreIcon } from "@/components/icons";
import { deleteItem, duplicateItem, setItemStatus } from "@/app/admin/actions";
import { useToast } from "@/components/toast";
import type { ItemStatus } from "@/lib/types";

/** Row-level actions that don't deserve their own button. */
export function ItemMenu({
  slug,
  itemId,
  status,
}: {
  slug: string;
  itemId: string;
  status: ItemStatus;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const run = (fn: () => Promise<unknown>, message: string) =>
    startTransition(async () => {
      await fn();
      setOpen(false);
      setConfirmDelete(false);
      push({ message });
      router.refresh();
    });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-7 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
      >
        <MoreIcon size={15} />
      </button>

      {/* Opens upward from the row, so it scales from its bottom edge. */}
      {open && (
        <div className="popover absolute bottom-9 right-0 z-20 w-52 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-pop [--transform-origin:bottom_right]">
          {status === "draft" && (
            <MenuItem
              disabled={isPending}
              onClick={() => run(() => setItemStatus(slug, itemId, "in_review"), "Sent for approval")}
            >
              Send for approval
            </MenuItem>
          )}
          {(status === "in_review" || status === "changes_requested") && (
            <MenuItem
              disabled={isPending}
              onClick={() => run(() => setItemStatus(slug, itemId, "approved"), "Marked approved")}
            >
              Mark approved for them
            </MenuItem>
          )}
          {status === "approved" && (
            <MenuItem
              disabled={isPending}
              onClick={() => run(() => setItemStatus(slug, itemId, "published"), "Marked published")}
            >
              Mark published
            </MenuItem>
          )}
          <MenuItem
            disabled={isPending}
            onClick={() => run(() => duplicateItem(slug, itemId), "Duplicated")}
          >
            Duplicate
          </MenuItem>
          <MenuItem
            disabled={isPending}
            onClick={() => run(() => setItemStatus(slug, itemId, "draft"), "Moved back to draft")}
          >
            Move to draft
          </MenuItem>

          <div className="my-1 border-t border-ink-100" />

          <MenuItem
            danger
            disabled={isPending}
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              run(() => deleteItem(slug, itemId), "Deleted");
            }}
          >
            {confirmDelete ? "Click again to delete" : "Delete"}
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? "block w-full px-3 py-1.5 text-left text-body text-stop-600 transition hover:bg-stop-100 disabled:opacity-50"
          : "block w-full px-3 py-1.5 text-left text-body text-ink-700 transition hover:bg-ink-100 disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}
