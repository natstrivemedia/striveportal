import "server-only";

import { sql, one } from "./db";
import type { ClientStrategy, ContentPillar, SmartGoal } from "./types";

export type GoalProgress = SmartGoal & {
  /** Latest value: from analytics when the goal is wired to a metric. */
  current: number;
  /** 0–1 of the way from baseline to target. Clamped. */
  progress: number;
  /** 0–1 of the way through the goal's time window. Clamped. */
  elapsed: number;
  daysLeft: number;
  /**
   * Progress minus elapsed time. Positive means ahead of the pace needed to
   * land the goal on time — the number that actually tells you to act.
   */
  pace: number;
  state: "achieved" | "ahead" | "on-track" | "behind" | "at-risk" | "missed" | "paused";
  /** What the value would need to be today to be exactly on pace. */
  parValue: number;
  sourceIsLive: boolean;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Grade a goal against both its target and its clock.
 *
 * Progress alone is misleading: 50% of the way there is excellent in week one
 * and alarming in the final week. Pace is progress measured against time spent,
 * which is the thing worth putting on screen.
 */
export function gradeGoal(
  goal: SmartGoal,
  current: number,
  sourceIsLive: boolean,
  today = new Date(),
): GoalProgress {
  const span = goal.target - goal.baseline;
  const progress = span === 0 ? 1 : clamp01((current - goal.baseline) / span);

  const start = new Date(`${goal.starts_on}T00:00:00`).getTime();
  const due = new Date(`${goal.due_on}T23:59:59`).getTime();
  const now = today.getTime();

  const window = Math.max(1, due - start);
  const elapsed = clamp01((now - start) / window);
  const daysLeft = Math.ceil((due - now) / 86_400_000);

  const pace = progress - elapsed;
  const parValue = goal.baseline + span * elapsed;

  let state: GoalProgress["state"];
  if (goal.status === "paused") state = "paused";
  else if (progress >= 1) state = "achieved";
  else if (daysLeft < 0) state = "missed";
  else if (pace >= 0.1) state = "ahead";
  else if (pace >= -0.05) state = "on-track";
  else if (pace >= -0.2) state = "behind";
  else state = "at-risk";

  return {
    ...goal,
    current,
    progress,
    elapsed,
    daysLeft,
    pace,
    state,
    parValue,
    sourceIsLive,
  };
}

/**
 * Current value for a metric-linked goal.
 *
 * Cumulative metrics (followers) take the latest reading; flow metrics are
 * summed across the goal's own window, which is what "500 more impressions by
 * March" actually means.
 */
async function liveValue(goal: SmartGoal): Promise<number | null> {
  if (!goal.source_metric) return null;

  const cumulative = goal.source_metric === "followers";

  if (cumulative) {
    const row = await one<{ v: number | null }>`
      select sum(value) as v from (
        select distinct on (network) network, value
        from analytics_snapshots
        where client_id = ${goal.client_id}
          and metric = ${goal.source_metric}
          and (${goal.source_network ?? null}::text is null
               or network = ${goal.source_network ?? null}::text)
        order by network, date desc
      ) latest
    `;
    return row?.v == null ? null : Number(row.v);
  }

  const row = await one<{ v: number | null }>`
    select coalesce(sum(value), 0) as v from analytics_snapshots
    where client_id = ${goal.client_id}
      and metric = ${goal.source_metric}
      and (${goal.source_network ?? null}::text is null
           or network = ${goal.source_network ?? null}::text)
      and date between ${goal.starts_on}::date and ${goal.due_on}::date
  `;
  return row?.v == null ? null : Number(row.v);
}

export async function listGoals(clientId: string): Promise<GoalProgress[]> {
  // The date columns are aliased to text of the same name, which makes a bare
  // ORDER BY ambiguous — qualify it so it sorts on the real date, not the string.
  const goals = await sql<SmartGoal>`
    select g.*, to_char(g.starts_on, 'YYYY-MM-DD') as starts_on,
           to_char(g.due_on, 'YYYY-MM-DD') as due_on
    from smart_goals g where g.client_id = ${clientId}
    order by g.status, g.due_on
  `;

  return Promise.all(
    goals.map(async (g) => {
      const live = await liveValue(g);
      const current = live ?? g.manual_current ?? g.baseline;
      return gradeGoal(g, current, live !== null);
    }),
  );
}

// ---------------------------------------------------------------------------
// Pillars and strategy
// ---------------------------------------------------------------------------

export async function listPillars(clientId: string): Promise<ContentPillar[]> {
  return sql<ContentPillar>`
    select * from content_pillars
    where client_id = ${clientId} and archived_at is null
    order by position, name
  `;
}

/** How the month's posts split across pillars — the balance check. */
export async function pillarMix(
  clientId: string,
  year: number,
  month: number,
): Promise<{ pillar_id: string | null; name: string | null; color: string | null; n: number }[]> {
  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const rows = await sql<{
    pillar_id: string | null; name: string | null; color: string | null; n: string;
  }>`
    select i.pillar_id, p.name, p.color, count(*)::text as n
    from items i
    left join content_pillars p on p.id = i.pillar_id
    where i.client_id = ${clientId}
      and i.scheduled_for >= ${from}::date
      and i.scheduled_for < (${from}::date + interval '1 month')
    group by i.pillar_id, p.name, p.color
    order by count(*) desc
  `;
  return rows.map((r) => ({ ...r, n: Number(r.n) }));
}

export async function getStrategy(clientId: string): Promise<ClientStrategy> {
  const row = await one<ClientStrategy>`
    select * from client_strategy where client_id = ${clientId}
  `;
  return (
    row ?? {
      client_id: clientId,
      positioning: "",
      audience: "",
      voice: "",
      notes: "",
      updated_at: new Date(),
    }
  );
}
