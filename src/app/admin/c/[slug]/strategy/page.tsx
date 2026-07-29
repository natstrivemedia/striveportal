import Link from "next/link";
import { notFound } from "next/navigation";
import { StrategyIcon, TrophyIcon } from "@/components/icons";
import { getClientBySlug } from "@/lib/queries";
import { getStrategy, listGoals, listPillars, pillarMix } from "@/lib/goals";
import { addGoal, addPillar, archivePillar, saveStrategy } from "./actions";
import { GoalCard } from "@/components/admin/GoalCard";
import { formatNumber, plural, cn } from "@/lib/utils";

export const metadata = { title: "Strategy · Strive Media" };

const PILLAR_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#7c3aed"];

export default async function StrategyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const now = new Date();
  const [strategy, goals, pillars, mix] = await Promise.all([
    getStrategy(client.id),
    listGoals(client.id),
    listPillars(client.id),
    pillarMix(client.id, now.getFullYear(), now.getMonth()),
  ]);

  const active = goals.filter((g) => g.status === "active" || g.status === "paused");
  const closed = goals.filter((g) => g.status !== "active" && g.status !== "paused");
  const onTrack = active.filter((g) => g.state === "on-track" || g.state === "ahead" || g.state === "achieved").length;
  const mixTotal = mix.reduce((n, m) => n + m.n, 0);

  const today = now.toISOString().slice(0, 10);
  const inNinety = new Date(now.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div
      className="mx-auto max-w-4xl"
      style={{ "--brand": client.brand_color } as React.CSSProperties}
    >
      <Link href={`/admin/c/${slug}`} className="text-small text-ink-500 hover:underline">
        ← {client.name}
      </Link>
      <h1 className="mt-1 text-h1 font-bold text-ink-900">Strategy</h1>
      <p className="mt-1 text-body text-ink-500">
        What we&apos;re doing for {client.name}, and how we&apos;ll know it worked.
      </p>

      {/* Scoreboard */}
      {active.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-[20px] border border-ink-200 bg-white p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <TrophyIcon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-h2 font-bold text-ink-900">
              {onTrack} of {plural(active.length, "goal")} on track
            </p>
            <p className="mt-0.5 text-body text-ink-500">
              {onTrack === active.length
                ? "Everything is pacing to land on time."
                : `${active.length - onTrack} need attention to finish on time.`}
            </p>
          </div>
          <div className="flex h-2 w-40 overflow-hidden rounded-full bg-ink-200">
            <span
              className="h-full bg-ok-600"
              style={{ width: `${(onTrack / active.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Goals */}
      <Section title="SMART goals" icon={<StrategyIcon size={15} />}>
        {active.length === 0 && closed.length === 0 ? (
          <p className="mb-4 text-body text-ink-400">
            No goals yet. A goal you can&apos;t measure is a wish — give it a number and a date.
          </p>
        ) : (
          <>
            <ul className="mb-4 flex flex-col gap-3">
              {active.map((g) => (
                <GoalCard key={g.id} slug={slug} goal={g} />
              ))}
            </ul>
            {closed.length > 0 && (
              <>
                <h3 className="mb-2 text-small font-semibold uppercase text-ink-400">
                  Closed
                </h3>
                <ul className="mb-4 flex flex-col gap-3 opacity-70">
                  {closed.map((g) => (
                    <GoalCard key={g.id} slug={slug} goal={g} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        <form
          action={addGoal.bind(null, slug)}
          className="rounded-[20px] border border-dashed border-ink-300 p-4"
        >
          <p className="mb-3 text-small font-semibold uppercase text-ink-500">
            New goal
          </p>
          <div className="flex flex-col gap-3">
            <Field label="Specific — what exactly are we doing?">
              <input
                name="title"
                required
                placeholder="Grow Instagram following to 500"
                className={inputCls}
              />
            </Field>
            <Field label="Relevant — why does it matter?">
              <input
                name="why"
                placeholder="Bigger reach for the fall donor campaign"
                className={inputCls}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Baseline">
                <input name="baseline" inputMode="decimal" placeholder="320" className={inputCls} />
              </Field>
              <Field label="Target">
                <input
                  name="target"
                  required
                  inputMode="decimal"
                  placeholder="500"
                  className={inputCls}
                />
              </Field>
              <Field label="Unit">
                <input name="unit" placeholder="followers" className={inputCls} />
              </Field>
              <Field label="Track from analytics">
                <select name="source_metric" defaultValue="" className={inputCls}>
                  <option value="">Enter manually</option>
                  <option value="followers">Followers</option>
                  <option value="reach">Reach</option>
                  <option value="impressions">Impressions</option>
                  <option value="engagement">Engagement</option>
                  <option value="posts">Posts published</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Network (optional)">
                <select name="source_network" defaultValue="" className={inputCls}>
                  <option value="">All networks</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </Field>
              <Field label="Starts">
                <input type="date" name="starts_on" defaultValue={today} className={inputCls} />
              </Field>
              <Field label="Time-bound — due by">
                <input
                  type="date"
                  name="due_on"
                  required
                  defaultValue={inNinety}
                  className={inputCls}
                />
              </Field>
            </div>

            <div>
              <button
                type="submit"
                className="cta bg-ink-950 text-white transition active:scale-[0.98]"
              >
                Add goal
              </button>
            </div>
          </div>
        </form>
      </Section>

      {/* Pillars */}
      <Section title="Content pillars">
        <p className="mb-3 text-body text-ink-500">
          The recurring themes this client posts under. Tag posts with them and the mix
          below tells you whether a month is balanced.
        </p>

        {pillars.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {pillars.map((p) => {
              const used = mix.find((m) => m.pillar_id === p.id)?.n ?? 0;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-3"
                >
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: p.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-900">{p.name}</p>
                    {p.description && (
                      <p className="mt-0.5 text-body text-ink-500">{p.description}</p>
                    )}
                  </div>
                  <span className="text-small text-ink-500">
                    {used} this month
                    {mixTotal > 0 && ` · ${Math.round((used / mixTotal) * 100)}%`}
                  </span>
                  <form action={archivePillar.bind(null, slug, p.id)}>
                    <button
                      type="submit"
                      className="rounded-full px-2.5 py-1 text-small font-semibold text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
                    >
                      Retire
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {mixTotal > 0 && (
          <div className="mb-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-ink-200">
              {mix.map((m) => (
                <span
                  key={m.pillar_id ?? "none"}
                  title={`${m.name ?? "Untagged"}: ${m.n}`}
                  className={cn("h-full", !m.color && "bg-ink-300")}
                  style={{
                    width: `${(m.n / mixTotal) * 100}%`,
                    background: m.color ?? undefined,
                  }}
                />
              ))}
            </div>
            <p className="mt-1.5 text-small text-ink-500">
              This month&apos;s mix across {plural(mixTotal, "post")}
              {mix.some((m) => !m.pillar_id) &&
                ` · ${mix.find((m) => !m.pillar_id)?.n} untagged`}
            </p>
          </div>
        )}

        <form
          action={addPillar.bind(null, slug)}
          className="flex flex-wrap items-end gap-2 rounded-[20px] border border-dashed border-ink-300 p-4"
        >
          <Field label="Pillar name" className="min-w-[160px] flex-1">
            <input name="name" required placeholder="Impact stories" className={inputCls} />
          </Field>
          <Field label="What belongs here" className="min-w-[200px] flex-[2]">
            <input
              name="description"
              placeholder="One person, one number, one quote"
              className={inputCls}
            />
          </Field>
          <fieldset>
            <legend className="mb-1 text-small font-medium text-ink-500">Colour</legend>
            <div className="flex gap-1.5">
              {PILLAR_COLORS.map((c, i) => (
                <label key={c} className="cursor-pointer">
                  <input
                    type="radio"
                    name="color"
                    value={c}
                    defaultChecked={i === 0}
                    className="peer sr-only"
                  />
                  <span
                    className="block size-7 rounded-lg ring-offset-2 transition peer-checked:ring-2 peer-checked:ring-ink-900"
                    style={{ background: c }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            className="cta bg-ink-950 text-white transition active:scale-[0.98]"
          >
            Add pillar
          </button>
        </form>
      </Section>

      {/* Strategy doc */}
      <Section title="The strategy">
        <form action={saveStrategy.bind(null, slug)} className="flex flex-col gap-4">
          <Field label="Positioning — what this account is for">
            <textarea
              name="positioning"
              rows={3}
              defaultValue={strategy.positioning}
              placeholder="The most trusted voice on hunger in the Triangle…"
              className={cn(inputCls, "resize-y")}
            />
          </Field>
          <Field label="Audience — who we're talking to">
            <textarea
              name="audience"
              rows={3}
              defaultValue={strategy.audience}
              placeholder="Recurring donors 45–70, plus volunteer coordinators…"
              className={cn(inputCls, "resize-y")}
            />
          </Field>
          <Field label="Voice — how we sound">
            <textarea
              name="voice"
              rows={3}
              defaultValue={strategy.voice}
              placeholder="Plain, warm, specific. Numbers over adjectives…"
              className={cn(inputCls, "resize-y")}
            />
          </Field>
          <Field label="Notes">
            <textarea
              name="notes"
              rows={4}
              defaultValue={strategy.notes}
              placeholder="Anything the next person needs to know."
              className={cn(inputCls, "resize-y")}
            />
          </Field>
          <div>
            <button
              type="submit"
              className="cta bg-ink-950 text-white transition active:scale-[0.98]"
            >
              Save strategy
            </button>
          </div>
        </form>
      </Section>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-body outline-none focus:border-ink-900 focus:bg-white";

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-body font-semibold text-ink-900">
        {icon && <span className="text-ink-400">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-small font-medium text-ink-500">{label}</span>
      {children}
    </label>
  );
}
