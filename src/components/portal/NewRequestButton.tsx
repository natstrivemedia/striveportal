"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PlusIcon } from "@/components/icons";
import { startRequest } from "@/app/p/[token]/actions";
import { useToast } from "@/components/toast";

/**
 * Creates the item up front so the composer has a real id to hang media on,
 * then navigates straight into it — one tap from intent to typing.
 */
export function NewRequestButton({ token }: { token: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await startRequest(token);
          if ("error" in res) {
            push({ message: res.error });
            return;
          }
          router.push(`/p/${token}/new/${res.id}`);
        })
      }
      className="inline-flex items-center gap-2 cta bg-white text-ink-950 shadow-lift transition active:scale-[0.98] disabled:opacity-60"
    >
      <PlusIcon size={18} />
      {isPending ? "Opening…" : "Write a post"}
    </button>
  );
}
