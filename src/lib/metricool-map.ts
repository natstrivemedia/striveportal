/**
 * Metricool Data Studio field IDs → the portal's canonical metric names.
 *
 * This mapping lives in versioned code, not in a prompt. The daily sync agent's
 * only job is to fetch raw rows and hand them to scripts/push-metricool.mts —
 * it never decides what a number means. That keeps the semantics reviewable and
 * stops a model from quietly re-interpreting "reach" one morning.
 *
 * Field IDs verified against getAnalyticsAvailableMetrics on 2026-07-26.
 */

export type Canonical = "followers" | "reach" | "impressions" | "engagement" | "posts";

export const FIELD_MAP: Record<string, { network: string; metric: Canonical }> = {
  // Instagram
  IGEV01: { network: "instagram", metric: "followers" },   // Followers (LAST)
  IGEV06: { network: "instagram", metric: "reach" },       // Account Reach timeline
  IGEV38: { network: "instagram", metric: "engagement" },  // Account Posts Interactions
  IGEV37: { network: "instagram", metric: "posts" },       // Account Posts

  // Facebook
  FBEV17: { network: "facebook", metric: "followers" },    // Page Followers (LAST)
  FBEV20: { network: "facebook", metric: "reach" },        // Daily calculated reach (timeline)
  FBEV34: { network: "facebook", metric: "engagement" },   // Page Posts Interactions
  FBEV33: { network: "facebook", metric: "posts" },        // Page Posts Count

  // LinkedIn — reports impressions, not reach. Mapped honestly rather than
  // relabelled, so the reach chart simply has no LinkedIn line.
  LIEV01: { network: "linkedin", metric: "followers" },    // Followers (LAST)
  LIEV22: { network: "linkedin", metric: "impressions" },  // Account Posts Impressions
  LIEV28: { network: "linkedin", metric: "engagement" },   // Account Posts Interactions
  LIEV27: { network: "linkedin", metric: "posts" },        // Account Posts
};

/** The default field set to request per network. */
export const DEFAULT_FIELDS: Record<string, string[]> = {
  instagram: ["IGEV01", "IGEV06", "IGEV38", "IGEV37"],
  facebook: ["FBEV17", "FBEV20", "FBEV34", "FBEV33"],
  linkedin: ["LIEV01", "LIEV22", "LIEV28", "LIEV27"],
};

/** Metricool returns dates as YYYYMMDD in the final column of each row. */
export function parseMetricoolDate(raw: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(raw).trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export type RawBlock = {
  /** Field IDs in the same order they were requested. */
  fields: string[];
  /** Each row: one value per field, then the YYYYMMDD date last. */
  rows: (string | number | null)[][];
};

export type Snapshot = {
  network: string;
  metric: string;
  date: string;
  value: number;
};

/**
 * Convert raw Metricool rows into canonical snapshots.
 * Nulls are dropped rather than coerced to 0 — "no data that day" and "zero
 * that day" are different claims, and only one of them is true.
 */
export function toSnapshots(blocks: RawBlock[]): Snapshot[] {
  const out: Snapshot[] = [];

  for (const block of blocks) {
    for (const row of block.rows) {
      const date = parseMetricoolDate(String(row[row.length - 1] ?? ""));
      if (!date) continue;

      block.fields.forEach((fieldId, i) => {
        const mapping = FIELD_MAP[fieldId];
        if (!mapping) return;
        const raw = row[i];
        if (raw === null || raw === undefined || raw === "") return;
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        out.push({ network: mapping.network, metric: mapping.metric, date, value });
      });
    }
  }

  return out;
}
