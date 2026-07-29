"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TrashIcon } from "@/components/icons";
import { discardRequest } from "@/app/p/[token]/actions";

/** Deleting is destructive and rare, so unlike approve it asks twice. */
export function DiscardRequestButton({
  token,
  itemId,
}: {
  token: string;
  itemId: string;
}) {
  const router = useRouter();
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
          await discardRequest(token, itemId);
          router.push(`/p/${token}/new`);
          router.refresh();
        });
      }}
      className={
        confirming
          ? "inline-flex items-center gap-1.5 cta bg-stop-100 text-stop-600"
          : "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small font-semibold text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
      }
    >
      <TrashIcon size={13} />
      {confirming ? "Tap again to delete" : "Discard"}
    </button>
  );
}
