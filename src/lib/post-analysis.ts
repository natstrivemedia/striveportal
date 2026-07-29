import "server-only";

import { sql } from "./db";
import type { AnalyticsPost } from "./types";

/**
 * Post performance analysis.
 *
 * Everything here compares a post to *this client's own* history, never to an
 * external benchmark. "Good engagement" is meaningless across accounts — 40
 * interactions is excellent for a 300-follower nonprofit and a failure for a
 * 200k retailer. The client's own median is the only honest yardstick.
 *
 * Findings are only emitted when there is enough history to support them
 * (MIN_SAMPLE), because a rule inferred from three posts is superstition.
 */

const MIN_SAMPLE = 8;

export type Verdict = "top" | "above" | "typical" | "below" | "weak";

export type PostInsight = {
  id: string;
  network: string;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  published_at: Date | null;
  engagement: number;
  reach: number | null;
  /** Engagement as a multiple of this client's median. 1.0 = typical. */
  index: number;
  verdict: Verdict;
  /** Percentile within this client's own posts, 0–100. */
  percentile: number;
  hour: number | null;
  weekday: number | null;
  captionLength: number;
  hashtagCount: number;
};

export type Finding = {
  kind: "timing" | "format" | "length" | "hashtags" | "cadence" | "sample";
  headline: string;
  detail: string;
  /** Positive = do more of this. Negative = do less. Null = neutral note. */
  lift: number | null;
  confidence: "low" | "high";
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function verdictFor(index: number): Verdict {
  if (index >= 2) return "top";
  if (index >= 1.25) return "above";
  if (index >= 0.75) return "typical";
  if (index >= 0.4) return "below";
  return "weak";
}

function engagementOf(p: AnalyticsPost): number {
  const m = p.metrics ?? {};
  const direct = Number(m.engagement ?? 0);
  if (direct > 0) return direct;
  // Fall back to summing the interaction parts when the provider gives them
  // separately rather than pre-totalled.
  return ["likes", "comments", "shares", "saves", "saved"].reduce(
    (n, k) => n + Number(m[k] ?? 0),
    0,
  );
}

function countHashtags(caption: string | null): number {
  return caption ? (caption.match(/#[\w-]+/g) ?? []).length : 0;
}

/** Every synced post, scored against the client's own distribution. */
export async function analysePosts(
  clientId: string,
  timeZone: string,
): Promise<{ posts: PostInsight[]; med: number }> {
  const rows = await sql<AnalyticsPost>`
    select * from analytics_posts
    where client_id = ${clientId}
    order by published_at desc nulls last
    limit 200
  `;

  const engagements = rows.map(engagementOf).filter((n) => n > 0);
  const med = median(engagements);
  const sorted = [...engagements].sort((a, b) => a - b);

  const posts = rows.map((p): PostInsight => {
    const engagement = engagementOf(p);
    const index = med > 0 ? engagement / med : 0;

    const below = sorted.filter((n) => n < engagement).length;
    const percentile = sorted.length ? Math.round((below / sorted.length) * 100) : 0;

    let hour: number | null = null;
    let weekday: number | null = null;
    if (p.published_at) {
      const d = new Date(p.published_at);
      hour = Number(
        new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(d),
      );
      const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
      weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
    }

    return {
      id: p.id,
      network: p.network,
      caption: p.caption,
      permalink: p.permalink,
      thumbnail_url: p.thumbnail_url,
      published_at: p.published_at,
      engagement,
      reach: p.metrics?.reach != null ? Number(p.metrics.reach) : null,
      index,
      verdict: verdictFor(index),
      percentile,
      hour,
      weekday,
      captionLength: p.caption?.length ?? 0,
      hashtagCount: countHashtags(p.caption),
    };
  });

  return { posts, med };
}

/**
 * Typical engagement index for a subset, or null when the subset is too small.
 *
 * Median, not mean, and deliberately so: one post that goes unusually wide will
 * drag a mean far enough to invent a pattern that isn't there. On a small
 * account a single 17× post would otherwise "prove" that whatever hour it went
 * out at is the best hour to post. The median ignores it.
 */
function liftOf(subset: PostInsight[], minimum = 3): number | null {
  if (subset.length < minimum) return null;
  return median(subset.map((p) => p.index));
}

/**
 * Patterns worth acting on.
 *
 * Each finding names the change to make, not just the observation — "post
 * mornings" rather than "morning engagement is higher".
 */
export function deriveFindings(posts: PostInsight[]): Finding[] {
  const scored = posts.filter((p) => p.engagement > 0);

  if (scored.length < MIN_SAMPLE) {
    return [
      {
        kind: "sample",
        headline: `Not enough history yet — ${scored.length} of ${MIN_SAMPLE} posts`,
        detail:
          "Patterns drawn from a handful of posts are noise. Keep publishing and this fills in automatically as analytics sync.",
        lift: null,
        confidence: "low",
      },
    ];
  }

  const findings: Finding[] = [];
  const confidence = scored.length >= 20 ? "high" : "low";

  // Timing — morning / afternoon / evening.
  const buckets: { label: string; test: (h: number) => boolean }[] = [
    { label: "mornings (before noon)", test: (h) => h < 12 },
    { label: "afternoons (12–5pm)", test: (h) => h >= 12 && h < 17 },
    { label: "evenings (after 5pm)", test: (h) => h >= 17 },
  ];
  const timed = scored.filter((p) => p.hour != null);
  if (timed.length >= MIN_SAMPLE) {
    const ranked = buckets
      .map((b) => ({ ...b, lift: liftOf(timed.filter((p) => b.test(p.hour!))) }))
      .filter((b): b is typeof b & { lift: number } => b.lift != null)
      .sort((a, b) => b.lift - a.lift);

    if (ranked.length >= 2 && ranked[0].lift - ranked[ranked.length - 1].lift > 0.3) {
      const best = ranked[0];
      const worst = ranked[ranked.length - 1];
      findings.push({
        kind: "timing",
        headline: `Post in the ${best.label.split(" ")[0]}`,
        detail: `Posts in the ${best.label} run ${best.lift.toFixed(1)}× your median engagement; ${worst.label} manage ${worst.lift.toFixed(1)}×. Moving the schedule is the cheapest change available — nothing about the content has to change.`,
        lift: best.lift - 1,
        confidence,
      });
    }
  }

  // Caption length — short vs long, split at the median.
  const withCaption = scored.filter((p) => p.captionLength > 0);
  if (withCaption.length >= MIN_SAMPLE) {
    const cut = median(withCaption.map((p) => p.captionLength));
    const short = liftOf(withCaption.filter((p) => p.captionLength <= cut));
    const long = liftOf(withCaption.filter((p) => p.captionLength > cut));
    if (short != null && long != null && Math.abs(short - long) > 0.25) {
      const shorterWins = short > long;
      findings.push({
        kind: "length",
        headline: shorterWins ? "Shorter captions win here" : "Longer captions win here",
        detail: shorterWins
          ? `Captions under ~${Math.round(cut)} characters average ${short.toFixed(1)}× median; longer ones ${long.toFixed(1)}×. Lead with the point and cut the wind-up.`
          : `Captions over ~${Math.round(cut)} characters average ${long.toFixed(1)}× median; shorter ones ${short.toFixed(1)}×. This audience reads — give them the story.`,
        lift: Math.abs(short - long),
        confidence,
      });
    }
  }

  // Hashtags — any vs none, and heavy vs light.
  const withTags = scored.filter((p) => p.hashtagCount > 0);
  const noTags = scored.filter((p) => p.hashtagCount === 0);
  const tagLift = liftOf(withTags);
  const noTagLift = liftOf(noTags);
  if (tagLift != null && noTagLift != null && Math.abs(tagLift - noTagLift) > 0.25) {
    const helps = tagLift > noTagLift;
    findings.push({
      kind: "hashtags",
      headline: helps ? "Hashtags are earning their place" : "Hashtags aren't helping",
      detail: helps
        ? `Posts with hashtags average ${tagLift.toFixed(1)}× median vs ${noTagLift.toFixed(1)}× without. Keep tagging.`
        : `Posts with hashtags average ${tagLift.toFixed(1)}× median vs ${noTagLift.toFixed(1)}× without. They're adding clutter, not reach — try dropping them for a month.`,
      lift: helps ? tagLift - noTagLift : noTagLift - tagLift,
      confidence,
    });
  }

  // Network — where the effort is actually paying.
  const networks = [...new Set(scored.map((p) => p.network))];
  if (networks.length > 1) {
    const ranked = networks
      .map((n) => ({ n, lift: liftOf(scored.filter((p) => p.network === n)) }))
      .filter((x): x is { n: string; lift: number } => x.lift != null)
      .sort((a, b) => b.lift - a.lift);
    if (ranked.length >= 2 && ranked[0].lift - ranked[ranked.length - 1].lift > 0.4) {
      findings.push({
        kind: "format",
        headline: `${ranked[0].n} is carrying this account`,
        detail: `${ranked[0].n} averages ${ranked[0].lift.toFixed(1)}× median engagement; ${ranked[ranked.length - 1].n} manages ${ranked[ranked.length - 1].lift.toFixed(1)}×. Worth rebalancing where the effort goes.`,
        lift: ranked[0].lift - 1,
        confidence,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      kind: "sample",
      headline: "No strong patterns yet",
      detail:
        "Performance is fairly even across timing, length and tags — no single lever stands out. That's a real answer, not a gap: the wins here will come from the content itself.",
      lift: null,
      confidence,
    });
  }

  return findings;
}
