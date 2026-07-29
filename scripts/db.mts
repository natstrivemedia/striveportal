/**
 * Database CLI.  Run with:  npm run db:migrate | db:seed | db:reset | db:links
 *
 * Uses the same driver as the app (src/lib/db-core.ts), so `migrate` applies the
 * identical SQL to local PGlite and to Supabase — the only difference is whether
 * DATABASE_URL is set.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// A standalone script doesn't get Next's .env.local loading.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local yet — PGlite defaults apply */
}

const { sql, exec, closeDb } = await import("../src/lib/db-core.ts");
const { newPortalToken, slugify } = await import("../src/lib/tokens.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(here, "..", "src", "lib", "schema.sql");

const target = process.env.DATABASE_URL ? "Supabase Postgres" : "PGlite (.data/pgdata)";

async function migrate() {
  const ddl = await readFile(schemaPath, "utf8");
  await exec(ddl);
  console.log(`✓ schema applied to ${target}`);
}

async function reset() {
  await exec(`drop schema public cascade; create schema public;`);
  console.log("✓ public schema dropped");
  await migrate();
}

/** The five brands already connected in Metricool, keyed by blog id. */
const BRANDS = [
  { name: "Encore for Humanity", blogId: 4818244, color: "#2563eb",
    platforms: ["instagram", "facebook"] },
  { name: "Addis Jemari", blogId: 6239279, color: "#b45309",
    platforms: ["instagram", "facebook", "linkedin"] },
  { name: "Epilepsy Foundation Hawaii", blogId: 6239297, color: "#7c3aed",
    platforms: ["instagram", "facebook"] },
  { name: "Inner Seoul", blogId: 6239324, color: "#db2777",
    platforms: ["instagram", "facebook"] },
  // No label set in Metricool; LinkedIn-only (urn:li:organization:105257487).
  { name: "Untitled Brand", blogId: 6239290, color: "#0f766e",
    platforms: ["linkedin"] },
];

/** Demo content so the approval flow is exercisable the moment you open it. */
const DEMO_ITEMS: Record<string, Array<{
  title: string; caption: string; status: string; day: number; type?: "post" | "asset";
}>> = {
  "encore-for-humanity": [
    { title: "Volunteer spotlight — Marcus", day: 3, status: "in_review",
      caption: "Marcus has driven 4,200 miles delivering meals this year. Ask him why and he shrugs: \"Somebody's got to.\"\n\n#EncoreForHumanity #Volunteer" },
    { title: "Impact numbers — Q2", day: 6, status: "in_review",
      caption: "12,400 meals. 318 families. One quarter.\n\nThank you for making the math work." },
    { title: "Behind the scenes — packing day", day: 9, status: "in_review",
      caption: "6am. Forty crates. One very caffeinated team." },
    { title: "Q2 Impact Report", day: 10, status: "in_review", type: "asset",
      caption: "Full Q2 report for your review before it goes to the board." },
    { title: "Donor thank-you reel", day: 14, status: "approved",
      caption: "To everyone who gave in June — this one's yours." },
    { title: "Program update — after school", day: 18, status: "changes_requested",
      caption: "Our after-school program is expanding to two new sites this fall." },
    { title: "Founder note", day: 22, status: "draft",
      caption: "Rough draft — still working the angle on this one." },
  ],
  "addis-jemari": [
    { title: "Girls' education milestone", day: 4, status: "in_review",
      caption: "Forty-two girls started secondary school this month. Last year that number was nine." },
    { title: "Staff spotlight — Hanna", day: 8, status: "in_review",
      caption: "Hanna runs our family reunification program. She has brought 87 children home." },
    { title: "Sponsor update template", day: 12, status: "approved",
      caption: "Monthly update going out to all sponsors this week." },
    { title: "Strategy deck — Fall campaign", day: 15, status: "in_review", type: "asset",
      caption: "Fall fundraising campaign direction. Looking for a yes on the overall concept." },
  ],
  "inner-seoul": [
    { title: "New arrival — ceramic set", day: 2, status: "in_review",
      caption: "Hand-thrown in Icheon. Six weeks from kiln to your kitchen." },
    { title: "Founder story", day: 7, status: "in_review",
      caption: "Why we started with tableware and not skincare." },
    { title: "Customer feature", day: 11, status: "approved",
      caption: "@leah.makes styled our celadon bowls better than we ever did." },
  ],
  "epilepsy-foundation-hawaii": [
    { title: "Seizure first aid carousel", day: 5, status: "in_review",
      caption: "Five steps. Save this one — you may need it for someone you love." },
    { title: "Support group schedule — August", day: 13, status: "in_review",
      caption: "August meetups on O'ahu, Maui, and Hawai'i Island." },
  ],
};

async function seed({ force = false } = {}) {
  const [{ count }] = await sql<{ count: string }>`select count(*)::text from clients`;
  if (Number(count) > 0 && !force) {
    console.log(`• ${count} clients already present — skipping seed (use --force to add anyway)`);
    return;
  }

  for (const brand of BRANDS) {
    const slug = slugify(brand.name);
    const [client] = await sql<{ id: string; portal_token: string }>`
      insert into clients (name, slug, metricool_blog_id, brand_color, portal_token)
      values (${brand.name}, ${slug}, ${brand.blogId}, ${brand.color}, ${newPortalToken()})
      on conflict (slug) do update set name = excluded.name
      returning id, portal_token
    `;

    const items = DEMO_ITEMS[slug] ?? [];
    if (items.length === 0) continue;

    const month = "2026-07-01";
    const [cal] = await sql<{ id: string }>`
      insert into calendars (client_id, month, title, status)
      values (${client.id}, ${month}::date, 'July 2026', 'in_review')
      on conflict (client_id, month) do update set title = excluded.title
      returning id
    `;

    let position = 0;
    for (const item of items) {
      const scheduled = `2026-07-${String(item.day).padStart(2, "0")}T14:00:00Z`;
      await sql`
        insert into items
          (client_id, calendar_id, type, title, caption, platforms,
           scheduled_for, status, position)
        values
          (${client.id}, ${cal.id}, ${item.type ?? "post"}, ${item.title},
           ${item.caption}, ${brand.platforms}::text[], ${scheduled}::timestamptz,
           ${item.status}, ${position++})
      `;
    }
    console.log(`  ${brand.name} — ${items.length} demo items`);
  }
  console.log("✓ seeded");
}

async function links() {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const rows = await sql<{ name: string; portal_token: string }>`
    select name, portal_token from clients where archived_at is null order by name
  `;
  if (rows.length === 0) return console.log("no clients yet — run: npm run db:seed");
  console.log("\nClient portal links\n");
  for (const r of rows) console.log(`  ${r.name.padEnd(30)} ${base}/p/${r.portal_token}`);
  console.log();
}

const cmd = process.argv[2];
const force = process.argv.includes("--force");

try {
  switch (cmd) {
    case "migrate": await migrate(); break;
    case "reset":   await reset(); await seed({ force: true }); break;
    case "seed":    await seed({ force }); break;
    case "links":   await links(); break;
    default:
      console.error("usage: db.mts <migrate|seed|reset|links> [--force]");
      process.exitCode = 1;
  }
} catch (err) {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
