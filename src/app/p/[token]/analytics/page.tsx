import { requireClient } from "@/lib/portal";
import { StatTile } from "@/components/charts/StatTile";
import { TrendChart } from "@/components/charts/TrendChart";
import { EmptyState } from "@/components/ui";
import { networkLabel } from "@/components/charts/palette";
import { headline, hasAnyAnalytics, lastSync, metricSeries, METRICS, topPosts } from "@/lib/analytics";
import { formatNumber, timeAgo } from "@/lib/utils";
import { AnalyticsIcon } from "@/components/icons";

export const metadata = { title: "Analytics", robots: { index: false } };

export default async function PortalAnalytics({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await requireClient(token);

  const has = await hasAnyAnalytics(client.id);

  if (!has) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6">
        <h1 className="mb-4 text-h2 font-bold text-ink-900">Analytics</h1>
        <EmptyState
          icon={<AnalyticsIcon size={30} />}
          title="No numbers yet"
          body="Your dashboard fills in after the first sync. Nothing for you to do."
        />
      </main>
    );
  }

  const [followers, reach, engagement, followerSeries, reachSeries, posts, sync] =
    await Promise.all([
      headline(client.id, METRICS.followers, 30, "cumulative"),
      headline(client.id, METRICS.reach, 30, "flow"),
      headline(client.id, METRICS.engagement, 30, "flow"),
      metricSeries(client.id, METRICS.followers, 90),
      metricSeries(client.id, METRICS.reach, 90),
      topPosts(client.id, 5),
      lastSync(),
    ]);

  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h1 className="text-h2 font-bold text-ink-900">Analytics</h1>
          {/* Honest about freshness: this data is as current as the last sync,
              not live, and the page says so rather than implying otherwise. */}
          <p className="text-small text-ink-400">Synced {timeAgo(sync?.finished_at ?? null)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {followers && (
            <StatTile label="Followers" value={followers.latest} delta={followers.delta} />
          )}
          {reach && <StatTile label="Reach (30d)" value={reach.latest} delta={reach.delta} />}
          {engagement && (
            <StatTile label="Engagement (30d)" value={engagement.latest} delta={engagement.delta} />
          )}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {followerSeries.points.length > 1 && (
            <TrendChart
              title="Follower growth — last 90 days"
              points={followerSeries.points}
              networks={followerSeries.networks}
            />
          )}
          {reachSeries.points.length > 1 && (
            <TrendChart
              title="Reach — last 90 days"
              points={reachSeries.points}
              networks={reachSeries.networks}
            />
          )}
        </div>

        {posts.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 px-1 text-small font-semibold uppercase text-ink-500">
              Top posts
            </h2>
            <ul className="flex flex-col gap-2">
              {posts.map((p) => (
                <li key={p.id}>
                  <a
                    href={p.permalink ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-[20px] border border-ink-200 bg-white p-3 transition hover:border-brand-ring"
                  >
                    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-100">
                      {p.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbnail_url} alt="" className="size-full object-cover" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-body text-ink-900">
                        {p.caption || "Untitled post"}
                      </span>
                      <span className="mt-0.5 block text-small text-ink-500">
                        {networkLabel(p.network)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-body font-semibold tabular-nums text-ink-900">
                        {formatNumber(Number(p.metrics?.engagement ?? 0))}
                      </span>
                      <span className="block text-small text-ink-400">engagements</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
