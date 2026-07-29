import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalyticsIcon, TrendUpIcon } from "@/components/icons";
import { getClientBySlug } from "@/lib/queries";
import { analysePosts, deriveFindings, type Verdict } from "@/lib/post-analysis";
import { EmptyState } from "@/components/ui";
import { formatDate, formatNumber, plural, cn } from "@/lib/utils";

export const metadata = { title: "Performance · Strive Media" };

const VERDICT: Record<Verdict, { label: string; chip: string }> = {
  top: { label: "Top post", chip: "bg-ok-100 text-ok-600" },
  above: { label: "Above par", chip: "bg-mint-100 text-mint-700" },
  typical: { label: "Typical", chip: "bg-ink-100 text-ink-500" },
  below: { label: "Below par", chip: "bg-amber-100 text-amber-700" },
  weak: { label: "Underperformed", chip: "bg-stop-100 text-stop-600" },
};

export default async function PerformancePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const { posts, med } = await analysePosts(client.id, client.timezone);
  const findings = deriveFindings(posts);

  const scored = posts.filter((p) => p.engagement > 0);
  const best = [...scored].sort((a, b) => b.index - a.index).slice(0, 5);
  const worst = [...scored].sort((a, b) => a.index - b.index).slice(0, 5);

  return (
    <div
      className="mx-auto max-w-4xl"
      style={{ "--brand": client.brand_color } as React.CSSProperties}
    >
      <Link href={`/admin/c/${slug}`} className="text-small text-ink-500 hover:underline">
        ← {client.name}
      </Link>
      <h1 className="mt-1 text-h1 font-medium text-ink-900">Performance</h1>
      <p className="mt-1 text-body text-ink-500">
        Every post scored against {client.name}&apos;s own median, not an industry
        average. {scored.length > 0 && `Median engagement is ${formatNumber(med)}.`}
      </p>

      {scored.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<AnalyticsIcon size={30} />}
            title="No published posts synced yet"
            body="This fills in once the Metricool sync brings back posts with engagement data."
          />
        </div>
      ) : (
        <>
          {/* What to change */}
          <section className="section-gap">
            <h2 className="mb-3 flex items-center gap-2 text-h2 font-medium text-ink-900">
              What to change
            </h2>
            <ul className="flex flex-col gap-2">
              {findings.map((f, i) => (
                <li key={i} className="card flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl",
                      f.lift && f.lift > 0
                        ? "bg-mint-100 text-mint-700"
                        : "bg-ink-100 text-ink-500",
                    )}
                  >
                    <TrendUpIcon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{f.headline}</p>
                    <p className="mt-1 text-body text-ink-700">{f.detail}</p>
                    {f.confidence === "low" && (
                      <p className="mt-1.5 text-small text-ink-400">
                        Based on a small sample — treat as a hunch, not a rule.
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="section-gap grid gap-6 md:grid-cols-2">
            <PostList title="Best performing" posts={best} timeZone={client.timezone} />
            <PostList
              title="Worth a post-mortem"
              posts={worst}
              timeZone={client.timezone}
            />
          </div>

          <p className="mt-6 text-small text-ink-400">
            Scored across {plural(scored.length, "post")}. A post at 1.0× performed
            exactly at your median; 2.0× is double it.
          </p>
        </>
      )}
    </div>
  );
}

function PostList({
  title,
  posts,
  timeZone,
}: {
  title: string;
  posts: Awaited<ReturnType<typeof analysePosts>>["posts"];
  timeZone: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-h2 font-medium text-ink-900">{title}</h2>
      <ul className="flex flex-col gap-2">
        {posts.map((p) => {
          const v = VERDICT[p.verdict];
          return (
            <li key={p.id} className="card-flush p-3">
              <a
                href={p.permalink ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3"
              >
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink-100">
                  {p.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail_url} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-body text-ink-900">
                    {p.caption || "Untitled post"}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={cn("pill px-2", v.chip)}>{v.label}</span>
                    <span className="text-small text-ink-500">
                      {p.index.toFixed(1)}× median · {formatNumber(p.engagement)} eng
                    </span>
                  </span>
                  <span className="mt-1 block text-small text-ink-400">
                    {p.published_at
                      ? formatDate(
                          p.published_at,
                          { month: "short", day: "numeric", hour: "numeric" },
                          timeZone,
                        )
                      : "—"}{" "}
                    · {p.network}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
