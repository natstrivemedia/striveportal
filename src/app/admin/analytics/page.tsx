import Link from "next/link";
import { AnalyticsIcon } from "@/components/icons";
import { listClients } from "@/lib/queries";
import { headline, hasAnyAnalytics, lastSync, METRICS } from "@/lib/analytics";
import { EmptyState } from "@/components/ui";
import { formatNumber, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata = { title: "Analytics · Strive Media" };

/**
 * Cross-client view.
 *
 * Deliberately a table, not five overlaid lines: the categorical palette only
 * validates to a handful of slots, and comparing five unrelated brands on one
 * axis would be a dual-axis mistake in disguise. Per-client detail lives on each
 * client's own dashboard.
 */
export default async function AdminAnalytics() {
  const clients = await listClients();
  const sync = await lastSync();

  const rows = await Promise.all(
    clients.map(async (c) => ({
      client: c,
      has: await hasAnyAnalytics(c.id),
      followers: await headline(c.id, METRICS.followers, 30, "cumulative"),
      reach: await headline(c.id, METRICS.reach, 30, "flow"),
      engagement: await headline(c.id, METRICS.engagement, 30, "flow"),
    })),
  );

  const anyData = rows.some((r) => r.has);

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-ink-900">Analytics</h1>
          <p className="mt-1 text-body text-ink-500">All clients, last 30 days</p>
        </div>
        <p className="text-small text-ink-400">Synced {timeAgo(sync?.finished_at ?? null)}</p>
      </div>

      {!anyData ? (
        <EmptyState
          icon={<AnalyticsIcon size={30} />}
          title="No analytics synced yet"
          body="Run the Metricool sync agent, or POST a payload to /api/ingest/metricool. See README."
        />
      ) : (
        <div className="overflow-x-auto rounded-[20px] border border-ink-200 bg-white shadow-lift">
          <table className="w-full min-w-[640px] text-body">
            <thead>
              <tr className="border-b border-ink-200 text-left">
                <th className="px-4 py-3 font-medium text-ink-500">Client</th>
                <th className="px-4 py-3 text-right font-medium text-ink-500">Followers</th>
                <th className="px-4 py-3 text-right font-medium text-ink-500">Reach 30d</th>
                <th className="px-4 py-3 text-right font-medium text-ink-500">Engagement 30d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, followers, reach, engagement }) => (
                <tr key={client.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/c/${client.slug}`}
                      className="font-medium text-ink-900 hover:underline"
                    >
                      {client.name}
                    </Link>
                  </td>
                  <Cell value={followers?.latest} delta={followers?.delta} />
                  <Cell value={reach?.latest} delta={reach?.delta} />
                  <Cell value={engagement?.latest} delta={engagement?.delta} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Cell({ value, delta }: { value?: number; delta?: number | null }) {
  if (value == null) {
    return <td className="px-4 py-3 text-right text-ink-400">—</td>;
  }
  return (
    <td className="px-4 py-3 text-right tabular-nums">
      <span className="font-semibold text-ink-900">{formatNumber(value)}</span>
      {delta != null && delta !== 0 && (
        <span
          className={cn(
            "ml-2 text-small font-semibold",
            delta > 0 ? "text-ok-600" : "text-stop-600",
          )}
        >
          {delta > 0 ? "▲" : "▼"} {formatNumber(Math.abs(delta))}
        </span>
      )}
    </td>
  );
}
