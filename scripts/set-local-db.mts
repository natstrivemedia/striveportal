/**
 * Rewrite the DATABASE_URL line in .env.local from piped input.
 *
 *   Get-Clipboard | npm run db:setlocal
 *
 * Hand-editing this line has failed repeatedly in ways that are invisible
 * afterwards: the wrong dashboard tab copied, an editor saving elsewhere, a
 * value that looks right and is not. This validates before writing and prints
 * what it changed — host, port and user only, never the password — so the
 * outcome is verifiable without opening the file.
 *
 * Only that one line changes; every other variable is preserved byte for byte.
 */
import { readFile, writeFile } from "node:fs/promises";
import { stdin } from "node:process";

const ENV_FILE = ".env.local";

let piped = "";
stdin.setEncoding("utf8");
for await (const chunk of stdin) piped += chunk;

const value = piped
  .trim()
  .replace(/^(export\s+)?DATABASE_URL\s*=\s*/i, "")
  .replace(/^["']|["']$/g, "")
  .replace(/^[<[]/, "")
  .replace(/[>\]]$/, "");

if (!value) {
  console.log("Nothing piped in. Copy the Session pooler URI, then run:");
  console.log("  Get-Clipboard | npm run db:setlocal");
  process.exit(1);
}

let url: URL;
try {
  url = new URL(value);
} catch {
  console.log(`✗ Not a URL (${value.length} chars, begins "${value.slice(0, 12)}").`);
  console.log("  Expected postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres");
  process.exit(1);
}

const problems: string[] = [];
if (!/^postgres(ql)?:$/.test(url.protocol)) {
  problems.push(`scheme is "${url.protocol.replace(":", "")}", expected postgresql`);
}
if (!url.password) problems.push("no password in the string");

/**
 * The direct endpoint is the specific thing this script exists to prevent.
 *
 * db.<ref>.supabase.co publishes only an AAAA record, so on an IPv4 network it
 * fails as a connection that never completes — no DNS error, no refusal, just a
 * ten-second hang. It is also the tab the dashboard shows first, which is how it
 * keeps getting copied.
 */
if (/^db\..*\.supabase\.co$/.test(url.hostname)) {
  problems.push(
    `host "${url.hostname}" is the DIRECT endpoint (IPv6-only, unreachable here) — ` +
      "in the Connect dialog choose Session pooler, not Direct connection",
  );
} else if (!url.hostname.includes("pooler.supabase.com")) {
  problems.push(`host "${url.hostname}" is not a Supabase pooler host`);
} else if (!/^postgres\.[a-z0-9]+$/.test(url.username)) {
  problems.push(`user is "${url.username}" but a pooler needs "postgres.<project-ref>"`);
}

if (problems.length) {
  console.log("✗ Not written:");
  for (const p of problems) console.log(`    - ${p}`);
  process.exit(1);
}

const original = await readFile(ENV_FILE, "utf8");
const line = `DATABASE_URL=${value}`;
// [ \t]* rather than \s*: \s matches newlines, so an anchored \s* swallows the
// blank line above the match and quietly reformats the file around the edit.
const pattern = /^[ \t]*DATABASE_URL[ \t]*=.*$/m;

const updated = pattern.test(original)
  ? original.replace(pattern, line)
  : original.replace(/\n*$/, `\n${line}\n`);

await writeFile(ENV_FILE, updated, "utf8");

console.log(`✓ Updated DATABASE_URL in ${ENV_FILE}`);
console.log(`    user  ${url.username}`);
console.log(`    host  ${url.hostname}`);
console.log(`    port  ${url.port || "(none)"}`);
console.log(`    pass  ${url.password.length} chars\n`);
console.log("  Next:  npm run db:links");
