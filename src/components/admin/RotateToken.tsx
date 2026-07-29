"use client";

import { useState, useTransition } from "react";
import { RefreshIcon } from "@/components/icons";
import { rotatePortalToken } from "@/app/admin/actions";

/**
 * Rotating the token is the kill switch for a leaked portal link, and it breaks
 * the URL the client already has — so unlike everything else in this product,
 * it deliberately asks twice.
 */
export function RotateToken({ slug }: { slug: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          setTimeout(() => setConfirming(false), 4000);
          return;
        }
        startTransition(async () => {
          await rotatePortalToken(slug);
          setConfirming(false);
        });
      }}
      className={
        confirming
          ? "inline-flex items-center gap-1.5 cta bg-stop-100 text-stop-600"
          : "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small font-semibold text-ink-500 transition hover:bg-ink-100"
      }
    >
      <RefreshIcon size={13} className={isPending ? "animate-spin" : undefined} />
      {confirming ? "Breaks their old link — confirm" : "Rotate link"}
    </button>
  );
}
