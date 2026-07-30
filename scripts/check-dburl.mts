/**
 * Diagnose a Postgres connection string without revealing it.
 *
 * Deploying a malformed DATABASE_URL fails with a bare "TypeError: Invalid URL
 * string" from inside postgres.js — no indication of which part is wrong, and
 * a Worker secret cannot be read back to inspect it. This checks the string
 * structurally and reports only shape: scheme, host, port, whether a password
 * is present. It never prints the password or the string itself, so it is safe
 * to run and safe to paste the output of.
 *
 *   npm run db:checkurl
 *
 * Paste the string at the prompt. Input is not echoed and not stored.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout, terminal: true });

// Suppress echo so the string never appears on screen or in scrollback.
const wasRaw = stdin.isTTY;
if (wasRaw) {
  const write = stdout.write.bind(stdout);
  (stdout as unknown as { write: typeof write }).write = ((chunk: string, ...rest: unknown[]) =>
    // Let the prompt through, swallow the echoed characters.
    typeof chunk === "string" && chunk.includes("Connection string")
      ? write(chunk, ...(rest as []))
      : true) as typeof write;
  process.on("exit", () => {
    (stdout as unknown as { write: typeof write }).write = write;
  });
}

const raw = await rl.question("Connection string (input hidden): ");
rl.close();
stdout.write("\n\n");

const problems: string[] = [];
const trimmed = raw.trim();

if (trimmed !== raw) problems.push("has leading/trailing whitespace or a newline");
if (/^[<[]|[>\]]$/.test(trimmed)) {
  problems.push("is wrapped in < > or [ ] brackets — paste the string without them");
}
if (trimmed.includes("[YOUR-PASSWORD]")) {
  problems.push("still contains the literal [YOUR-PASSWORD] placeholder");
}
if (/\s/.test(trimmed)) problems.push("contains an internal space");

let parsed: URL | null = null;
try {
  parsed = new URL(trimmed.replace(/^[<[]|[>\]]$/g, ""));
} catch {
  problems.push("is not a parseable URL — this is the exact failure the Worker hits");
}

if (parsed) {
  console.log("  scheme    ", parsed.protocol.replace(":", ""));
  console.log("  host      ", parsed.hostname);
  console.log("  port      ", parsed.port || "(none — Postgres will assume 5432)");
  console.log("  database  ", parsed.pathname.replace(/^\//, "") || "(none)");
  console.log("  user      ", parsed.username || "(none)");
  console.log("  password  ", parsed.password ? `present (${parsed.password.length} chars)` : "MISSING");
  console.log();

  if (!/^postgres(ql)?$/.test(parsed.protocol.replace(":", ""))) {
    problems.push(`scheme is "${parsed.protocol.replace(":", "")}", expected postgresql`);
  }
  if (!parsed.password) problems.push("no password in the string");
  if (parsed.port === "5432") {
    console.log("  Note: port 5432 is the DIRECT connection. Correct for local");
    console.log("  migrations; the Worker wants the POOLED string on 6543.\n");
  }
  if (parsed.port === "6543") {
    console.log("  Note: port 6543 is the pooled connection — correct for the Worker.\n");
  }
}

if (problems.length === 0) {
  console.log("✓ Structurally valid. If the Worker still fails, the credential");
  console.log("  itself is wrong (wrong password, or the project was paused).");
} else {
  console.log("✗ Problems found:");
  for (const p of problems) console.log(`    - ${p}`);
}
