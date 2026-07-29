import Link from "next/link";
import type { Client } from "@/lib/types";

/** Brand bar. Navigation lives in PortalTabs directly beneath it. */
export function PortalHeader({ client, token }: { client: Client; token: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <Link href={`/p/${token}`} className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-body font-bold text-[var(--brand-on)]"
          >
            {client.name.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-body font-semibold text-ink-900">
              {client.name}
            </span>
            <span className="block truncate text-small text-ink-500">
              Content review · Strive Media
            </span>
          </span>
        </Link>
      </div>
    </header>
  );
}
