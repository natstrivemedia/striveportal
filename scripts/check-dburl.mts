/**
 * Diagnose a Postgres connection string without revealing it.
 *
 * A malformed DATABASE_URL surfaces only as "TypeError: Invalid URL string"
 * from inside postgres.js, and a Worker secret cannot be read back to inspect
 * it. This reports shape only — scheme, host, port, whether a password is
 * present — never the password or the string itself, so the output is safe to
 * share.
 *
 *   npm run db:checkurl              # hidden prompt
 *   Get-Content file | npm run db:checkurl    # or pipe it in
 *
 * Input is never echoed, never logged, and never written anywhere.
 */
import { stdin, stdout } from "node:process";

/**
 * Read a line with echo off.
 *
 * Raw mode rather than readline: an earlier version tried to suppress
 * readline's echo by replacing stdout.write, which swallowed the prompt too and
 * left the script looking hung. Raw mode simply never echoes in the first
 * place.
 *
 * Chunks matter — a pasted 100-character string arrives as one chunk, not 100
 * keypresses, so this iterates characters instead of treating each chunk as a
 * single key.
 */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let buf = "";
    const done = (value: string) => {
      stdin.setRawMode?.(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n\n");
      resolve(value);
    };

    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(buf);
        if (ch === "\u0003") {
          stdin.setRawMode?.(false);
          stdout.write("\n");
          return reject(new Error("cancelled"));
        }
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
        else if (ch >= " ") buf += ch;
      }
    };

    stdin.on("data", onData);
  });
}

/** Read all of stdin, for the piped case. */
async function readPiped(): Promise<string> {
  let data = "";
  stdin.setEncoding("utf8");
  for await (const chunk of stdin) data += chunk;
  return data;
}

// A pipe has no TTY, so prompting into it would hang forever.
const raw = stdin.isTTY
  ? await askHidden("Connection string (input hidden, then press Enter): ")
  : await readPiped();

if (raw.trim() === "") {
  console.log("Nothing read. Paste the string at the prompt, or pipe it in:");
  console.log("  Get-Content yourfile.txt | npm run db:checkurl");
  process.exit(1);
}

const problems: string[] = [];
const notes: string[] = [];
let trimmed = raw.trim();

/**
 * Name the format before validating it.
 *
 * Supabase's Connect dialog offers the same credentials in several shapes —
 * URI, psql, JDBC, .NET, and per-language snippets — and only the URI belongs
 * in DATABASE_URL. "Does not parse as a URL" is true of all the others and
 * tells you nothing about which one you grabbed, so identify it by name and say
 * where the right one is.
 */
if (/^psql\b/i.test(trimmed)) {
  problems.push(
    'this is the "psql" command, not the URI — in Supabase\'s Connect dialog, ' +
      "switch the Type dropdown from psql to URI",
  );
} else if (/^jdbc:/i.test(trimmed)) {
  problems.push('this is the JDBC form — switch the Type dropdown to "URI"');
} else if (/(^|\s)(Host|User|Password|Port|Database)\s*[:=]/i.test(trimmed)) {
  problems.push(
    "this looks like the parameters panel copied as a block, not a single " +
      'connection string — switch the Type dropdown to "URI"',
  );
}

// Tolerate the shapes people reasonably paste: an env-file line, or quotes.
const stripped = trimmed
  .replace(/^(export\s+)?DATABASE_URL\s*=\s*/i, "")
  .replace(/^["']|["']$/g, "");
if (stripped !== trimmed) {
  notes.push('ignored a leading "DATABASE_URL=" and/or surrounding quotes');
  trimmed = stripped;
}

// Strip a bracket wrapper before parsing, but still report it — this is the
// exact mistake that turns a valid string into "Invalid URL string".
const unwrapped = trimmed.replace(/^[<[]/, "").replace(/[>\]]$/, "");
if (unwrapped !== trimmed) {
  problems.push("is wrapped in < > or [ ] brackets — paste it without them");
}
if (/^\S*\s+\S/.test(trimmed)) problems.push("contains an internal space");
if (trimmed.includes("[YOUR-PASSWORD]")) {
  problems.push("still contains the literal [YOUR-PASSWORD] placeholder");
}
if (trimmed.includes("\n")) problems.push("contains a line break");

let parsed: URL | null = null;
try {
  parsed = new URL(unwrapped);
} catch {
  problems.push("does not parse as a URL — this is exactly what the Worker hits");

  /**
   * Show just enough to recognise what was pasted.
   *
   * Everything up to the first ":" after the scheme is structural — in
   * "postgresql://postgres.abc:pw@host" that is the scheme and username, never
   * the password. Cutting there identifies the format without leaking the
   * credential. Strings with no "://" get a length only, since there is no
   * safe boundary to cut at.
   */
  const marker = unwrapped.indexOf("://");
  if (marker !== -1) {
    const colon = unwrapped.indexOf(":", marker + 3);
    const head = unwrapped.slice(0, colon === -1 ? Math.min(marker + 3, 40) : colon);
    console.log(`  starts with  ${head}:…`);
    console.log(`  length       ${unwrapped.length} chars\n`);
  } else {
    console.log(`  no "://" anywhere — not a connection URI at all`);
    console.log(`  length       ${unwrapped.length} chars\n`);
  }
}

if (parsed) {
  const scheme = parsed.protocol.replace(":", "");
  console.log("  scheme    ", scheme);
  console.log("  host      ", parsed.hostname);
  console.log("  port      ", parsed.port || "(none — Postgres assumes 5432)");
  console.log("  database  ", parsed.pathname.replace(/^\//, "") || "(none)");
  console.log("  user      ", parsed.username || "(none)");
  console.log(
    "  password  ",
    parsed.password ? `present (${parsed.password.length} chars)` : "MISSING",
  );
  console.log();

  if (!/^postgres(ql)?$/.test(scheme)) {
    problems.push(`scheme is "${scheme}", expected postgresql`);
  }
  if (!parsed.password) problems.push("has no password");
  if (parsed.port === "5432") {
    console.log("  Port 5432 is the DIRECT connection — right for local");
    console.log("  migrations, but the Worker wants POOLED on 6543.\n");
  } else if (parsed.port === "6543") {
    console.log("  Port 6543 is the pooled connection — right for the Worker.\n");
  }
}

for (const n of notes) console.log(`  note: ${n}`);
if (notes.length) console.log();

if (problems.length === 0) {
  console.log("✓ Structurally valid. If the Worker still fails, the credential");
  console.log("  itself is wrong — wrong password, or the project is paused.");
} else {
  console.log("✗ Problems found:");
  for (const p of problems) console.log(`    - ${p}`);
  console.log();
  console.log("  A correct pooled string looks exactly like this shape:");
  console.log("    postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres");
  console.log();
  console.log("  Supabase dashboard → Connect → Type: URI → Transaction pooler.");
  process.exit(1);
}
