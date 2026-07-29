"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PlusIcon } from "@/components/icons";
import { quickCreate } from "@/app/admin/actions";
import { useToast } from "@/components/toast";

/**
 * Creates the post up front and opens the composer on it, so there is no
 * intermediate "name your post" step between wanting one and writing one.
 */
export function NewPostButton({
  slug,
  month,
  view,
}: {
  slug: string;
  month: string;
  view: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await quickCreate(slug, month);
          if ("error" in res) {
            push({ message: res.error });
            return;
          }
          router.push(
            `/admin/c/${slug}?view=${view}&month=${month}&post=${res.id}`,
          );
          router.refresh();
        })
      }
      className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-[var(--brand-on,#fff)] shadow-lift transition active:scale-[0.98] disabled:opacity-60"
    >
      <PlusIcon size={15} />
      {isPending ? "Creating…" : "New Post"}
    </button>
  );
}
