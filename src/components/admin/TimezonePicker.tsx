"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GlobeIcon } from "@/components/icons";
import { setClientTimezone } from "@/app/admin/actions";
import { useToast } from "@/components/toast";
import { TIMEZONES, offsetLabel, timezoneLabel } from "@/lib/timezones";
import { cn } from "@/lib/utils";

/**
 * Switches the timezone a client's calendar is expressed in.
 *
 * The change is saved to the client, not to your session — this is how their
 * dates read in their own portal too, so the two of you are never looking at
 * the same post on different days.
 */
export function TimezonePicker({
  slug,
  timezone,
}: {
  slug: string;
  timezone: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function pick(tz: string) {
    setOpen(false);
    if (tz === timezone) return;
    startTransition(async () => {
      await setClientTimezone(slug, tz);
      push({ message: `Times now shown in ${timezoneLabel(tz)}` });
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50"
      >
        <GlobeIcon size={14} />
        {timezoneLabel(timezone)}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          {/* Anchored bottom-right of the trigger, so it scales out of it. */}
          <div className="popover absolute right-0 top-9 z-20 max-h-72 w-56 overflow-y-auto rounded-xl border border-ink-200 bg-white py-1 shadow-pop [--transform-origin:top_right]">
            {TIMEZONES.map((tz) => (
              <button
                key={tz.value}
                type="button"
                onClick={() => pick(tz.value)}
                className={cn(
                  "flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-body transition hover:bg-ink-100",
                  tz.value === timezone ? "font-semibold text-ink-900" : "text-ink-700",
                )}
              >
                <span className="flex-1">{tz.label}</span>
                <span className="text-[11px] text-ink-400">{offsetLabel(tz.value)}</span>
                {tz.value === timezone && <span className="text-ink-900">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
