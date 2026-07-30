/**
 * Write a fresh `wrangler secret bulk` template outside the repo.
 *
 * The file holds live credentials in plain text, so the correct lifecycle is
 * create → fill → upload → delete. That means needing a new one every time,
 * which should not require asking anyone.
 *
 * Deliberately written to the parent directory: inside the repo, one missed
 * .gitignore entry commits your database password.
 *
 *   npm run secrets:template
 */
import { writeFile, access } from "node:fs/promises";
import path from "node:path";

const target = path.resolve(process.cwd(), "..", "portal-secrets.json");

// Never clobber a file that may already hold real values.
try {
  await access(target);
  console.log(`✗ ${target} already exists — refusing to overwrite it.`);
  console.log("  Delete it first if you want a fresh template.");
  process.exit(1);
} catch {
  /* does not exist, which is what we want */
}

await writeFile(
  target,
  JSON.stringify(
    {
      DATABASE_URL: "PASTE_POOLED_URI_HERE",
      SUPABASE_URL: "PASTE_PROJECT_URL_HERE",
      SUPABASE_SERVICE_ROLE_KEY: "PASTE_SERVICE_ROLE_KEY_HERE",
      ADMIN_PASSWORD: "PASTE_YOUR_CHOSEN_PASSWORD_HERE",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log(`✓ Wrote ${target}\n`);
console.log("  1. Fill in the four values:");
console.log("       DATABASE_URL               Connect -> Type: URI -> Transaction pooler (6543)");
console.log("       SUPABASE_URL               Settings -> API -> Project URL");
console.log("       SUPABASE_SERVICE_ROLE_KEY  Settings -> API -> service_role (not anon)");
console.log("       ADMIN_PASSWORD             your choice, 12+ characters\n");
console.log("  2. npm run secrets:check ../portal-secrets.json");
console.log("  3. npx wrangler secret bulk ../portal-secrets.json");
console.log("  4. del ..\\portal-secrets.json");
