"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, LinkIcon, PauseIcon, PlayIcon, TrashIcon, TrendUpIcon } from "@/components/icons";
import {
  deleteGoal,
  setGoalStatus,
  updateGoalProgress,
} from "@/app/admin/c/[slug]/strategy/actions";
import { useToast } from "@/components/toast";
import { formatNumber, cn } from "@/lib/utils";
import type { GoalProgress } from "@/lib/goals";

/**
 * A goal, graded against both its target and its clock.
 *
 * The ring shows progress; the marker on it shows where you'd need to be today
 * to finish on time. Being able to see those two things apart is the whole
 * point — 60% done is a triumph in week one and a problem in the final week.
 */

const STATE: Record<
  GoalProgress["state"],
  { label: string; ring: string; chip: string }
> = {
  achieved: { label: "Achieved", ring: "stroke-ok-600", chip: "bg-ok-100 text-ok-600" },
  ahead: { label: "Ahead of pace", ring: "stroke-ok-600", chip: "bg-ok-100 text-ok-600" },
  "on-track": { label: "On track", ring: "stroke-ok-600", chip: "bg-ok-100 text-ok-600" },
  behind: { label: "Slightly behind", ring: "stroke-warn-600", chip: "bg-warn-100 text-warn-600" },
  "at-risk": { label: "At risk", ring: "stroke-stop-600", chip: "bg-stop-100 text-stop-600" },
  missed: { label: "Missed", ring: "stroke-stop-600", chip: "bg-stop-100 text-stop-600" },
  paused: { label: "Paused", ring: "stroke-ink-400", chip: "bg-ink-100 text-ink-500" },
};

export function GoalCard({ slug, goal }: { slug: string; goal: GoalProgress }) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");

  const s = STATE[goal.state];
  const pct = Math.round(goal.progress * 100);

  const R = 34;
  const C = 2 * Math.PI * R;

  function logValue() {
    const value = Number(draft.replace(/,/g, ""));
    if (!Number.isFinite(value)) return;
    startTransition(async () => {
      await updateGoalProgress(slug, goal.id, value);
      setDraft("");
      push({ message: "Progress updated" });
      router.refresh();
    });
  }

  const act = (fn: () => Promise<unknown>, message: string) =>
    startTransition(async () => {
      await fn();
      push({ message });
      router.refresh();
    });

  return (
    <li className="rounded-[20px] border border-ink-200 bg-white p-5">
      <div className="flex items-start gap-5">
        {/* Progress ring */}
        <div className="relative shrink-0">
          <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
            <circle cx="42" cy="42" r={R} className="fill-none stroke-ink-200" strokeWidth="7" />
            <circle
              cx="42"
              cy="42"
              r={R}
              className={cn("fill-none transition-all", s.ring)}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - goal.progress)}
            />
            {/* Where you'd need to be today to land on time. */}
            {goal.state !== "achieved" && goal.elapsed > 0 && goal.elapsed < 1 && (
              <circle
                cx="42"
                cy="42"
                r={R}
                className="fill-none stroke-ink-900"
                strokeWidth="7"
                strokeDasharray={`2 ${C}`}
                strokeDashoffset={-C * goal.elapsed}
              />
            )}
          </svg>
          <span className="absolute inset-0 grid place-items-center">
            <span className="text-h2 font-bold tabular-nums text-ink-900">{pct}%</span>
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-ink-900">{goal.title}</h3>
              {goal.why && <p className="mt-0.5 text-body text-ink-500">{goal.why}</p>}
            </div>
            <span className={cn("rounded-full px-2.5 py-1 text-small font-semibold", s.chip)}>
              {s.label}
            </span>
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-body">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-500">Now</dt>
              <dd className="font-semibold tabular-nums text-ink-900">
                {formatNumber(goal.current)}
                {goal.unit && <span className="text-ink-500"> {goal.unit}</span>}
              </dd>
              {goal.sourceIsLive && (
                <span
                  title="Pulled from analytics"
                  className="inline-flex items-center gap-0.5 rounded bg-ink-100 px-1 text-[10px] font-medium text-ink-500"
                >
                  <LinkIcon size={9} /> live
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-500">Target</dt>
              <dd className="font-semibold tabular-nums text-ink-900">
                {formatNumber(goal.target)}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-500">Par today</dt>
              <dd className="tabular-nums text-ink-700">{formatNumber(goal.parValue)}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-500">
                {goal.daysLeft >= 0 ? "Days left" : "Overdue by"}
              </dt>
              <dd className="tabular-nums text-ink-700">{Math.abs(goal.daysLeft)}</dd>
            </div>
          </dl>

          {goal.state !== "achieved" && goal.daysLeft > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-small text-ink-500">
              <TrendUpIcon size={12} />
              {goal.current >= goal.parValue
                ? `${formatNumber(goal.current - goal.parValue)} ahead of pace`
                : `${formatNumber(goal.parValue - goal.current)} behind pace — needs ${formatNumber(
                    Math.max(0, (goal.target - goal.current) / Math.max(1, goal.daysLeft)),
                  )} ${goal.unit || "per"} a day`}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
            {!goal.sourceIsLive && (
              <>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") logValue();
                  }}
                  inputMode="decimal"
                  placeholder="Log a number"
                  className="w-32 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-body outline-none focus:border-ink-900 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={logValue}
                  disabled={isPending || !draft}
                  className="rounded-lg border border-ink-200 px-3 py-1.5 text-small font-semibold text-ink-700 transition hover:bg-ink-100 disabled:opacity-40"
                >
                  Update
                </button>
              </>
            )}

            <span className="flex-1" />

            {goal.status === "active" && goal.progress >= 1 && (
              <button
                type="button"
                onClick={() => act(() => setGoalStatus(slug, goal.id, "achieved"), "Goal closed out")}
                className="inline-flex items-center gap-1 rounded-lg bg-ok-100 px-3 py-1.5 text-small font-semibold text-ok-600 transition hover:brightness-95"
              >
                <CheckIcon size={13} /> Close it out
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                act(
                  () => setGoalStatus(slug, goal.id, goal.status === "paused" ? "active" : "paused"),
                  goal.status === "paused" ? "Resumed" : "Paused",
                )
              }
              aria-label={goal.status === "paused" ? "Resume goal" : "Pause goal"}
              className="grid size-7 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
            >
              {goal.status === "paused" ? <PlayIcon size={13} /> : <PauseIcon size={13} />}
            </button>
            <button
              type="button"
              onClick={() => act(() => deleteGoal(slug, goal.id), "Goal deleted")}
              aria-label="Delete goal"
              className="grid size-7 place-items-center rounded-lg text-ink-400 transition hover:bg-stop-100 hover:text-stop-600"
            >
              <TrashIcon size={13} />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
