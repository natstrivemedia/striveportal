"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveAll } from "@/app/p/[token]/actions";
import { useToast } from "@/components/toast";
import { plural } from "@/lib/utils";

/**
 * The batch escape hatch. Some clients would rather scan a month and sign it off
 * in one go than step through post by post — this respects that without making
 * it the default, since per-item review is what produces useful feedback.
 *
 * Unlike single approve, this one DOES confirm: it is a bulk, less reversible
 * action, and the tap it costs is paid once rather than per item.
 */
export function ApproveAllButton({
  token,
  count,
  calendarId,
}: {
  token: string;
  count: number;
  calendarId?: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function run() {
    startTransition(async () => {
      const res = await approveAll(token, calendarId);
      setConfirming(false);
      if (!res.ok) {
        push({ message: res.error });
        return;
      }
      push({ message: `${plural(count, "post")} approved — thank you` });
      router.push(`/p/${token}?done=1`);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-white/30 px-6 py-3.5 text-center text-body font-semibold text-[var(--brand-on)] transition hover:bg-white/10 active:scale-[0.98]"
      >
        Approve all {count}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={isPending}
      autoFocus
      className="rounded-full bg-white/20 px-6 py-3.5 text-center text-body font-semibold text-[var(--brand-on)] ring-2 ring-white/60 transition active:scale-[0.98] disabled:opacity-60"
    >
      {isPending ? "Approving…" : `Tap again to confirm all ${count}`}
    </button>
  );
}
