import Link from "next/link";
import { createClient } from "@/app/admin/actions";

export const metadata = { title: "Add client · Strive Media" };

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Pacific/Honolulu",
  "Europe/London",
  "Africa/Addis_Ababa",
  "Asia/Seoul",
];

const COLORS = ["#1c1917", "#2563eb", "#b45309", "#7c3aed", "#db2777", "#0f766e", "#15803d"];

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-lg py-8">
      <Link href="/admin" className="text-small text-ink-500 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-1 text-h1 font-bold text-ink-900">Add a client</h1>
      <p className="mt-1 text-body text-ink-500">
        Only the name is required. They get a portal link immediately — you decide when
        to send it.
      </p>

      <form
        action={createClient}
        className="mt-6 flex flex-col gap-4 rounded-[20px] border border-ink-200 bg-white p-5 shadow-lift"
      >
        <label>
          <span className="mb-1 block text-small font-medium text-ink-500">Client name</span>
          <input
            name="name"
            required
            autoFocus
            placeholder="Encore for Humanity"
            className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
        </label>

        <label>
          <span className="mb-1 block text-small font-medium text-ink-500">
            Their timezone
          </span>
          <select
            name="timezone"
            defaultValue="America/New_York"
            className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-body outline-none focus:border-ink-900 focus:bg-white"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-small text-ink-400">
            Scheduled times are shown to them in this zone.
          </span>
        </label>

        <fieldset>
          <legend className="mb-1.5 text-small font-medium text-ink-500">Brand colour</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c, i) => (
              <label key={c} className="cursor-pointer">
                <input
                  type="radio"
                  name="brand_color"
                  value={c}
                  defaultChecked={i === 0}
                  className="peer sr-only"
                />
                <span
                  className="block size-8 rounded-lg ring-offset-2 transition peer-checked:ring-2 peer-checked:ring-ink-900"
                  style={{ background: c }}
                />
              </label>
            ))}
          </div>
          <span className="mt-1.5 block text-small text-ink-400">
            Tints their portal — the only branding they see.
          </span>
        </fieldset>

        <label>
          <span className="mb-1 block text-small font-medium text-ink-500">
            Metricool brand ID <span className="text-ink-400">(optional)</span>
          </span>
          <input
            name="metricool_blog_id"
            inputMode="numeric"
            placeholder="4818244"
            className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
          <span className="mt-1 block text-small text-ink-400">
            Links their analytics. Add it later from Settings if you don&apos;t have it now.
          </span>
        </label>

        <button
          type="submit"
          className="mt-1 w-full rounded-full bg-ink-950 py-3 text-body font-semibold text-white transition active:scale-[0.99]"
        >
          Add client
        </button>
      </form>
    </div>
  );
}
