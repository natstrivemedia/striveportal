/**
 * Validate a `wrangler secret bulk` file before uploading it.
 *
 * Wrangler's interactive `secret put` prompt accepts whatever it receives and
 * reports success — a paste that lands as 4 characters is stored as 4
 * characters, and the only symptom is a 500 on the deployed site with no
 * mention of which secret is wrong. That is a long way to travel to find a
 * truncated paste.
 *
 * This checks each value's shape and prints lengths and structure only, never
 * the values, so the output is safe to share.
 *
 *   npm run secrets:check ../portal-secrets.json
 */
import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) {
  console.log("Usage: npm run secrets:check <path-to-json>");
  process.exit(1);
}

let doc: Record<string, unknown>;
try {
  doc = JSON.parse(await readFile(file, "utf8"));
} catch (err) {
  console.log(`✗ Could not read or parse ${file}`);
  console.log(`  ${err instanceof Error ? err.message : String(err)}`);
  console.log("\n  It must be a JSON object: { \"NAME\": \"value\", ... }");
  process.exit(1);
}

type Check = (v: string) => string | null;

/** Each check returns a problem description, or null when the value is fine. */
const checks: Record<string, { label: string; check: Check }> = {
  DATABASE_URL: {
    label: "pooled Postgres URI",
    check: (v) => {
      if (/\s/.test(v)) return "contains whitespace — likely the psql command, not the URI";
      if (/^[<[]|[>\]]$/.test(v)) return "wrapped in brackets";
      if (v.includes("[YOUR-PASSWORD]")) return "still has the [YOUR-PASSWORD] placeholder";
      let u: URL;
      try {
        u = new URL(v);
      } catch {
        return `not a URL (${v.length} chars) — expected postgresql://user:pass@host:6543/postgres`;
      }
      if (!/^postgres(ql)?:$/.test(u.protocol)) return `scheme is "${u.protocol.replace(":", "")}", expected postgresql`;
      if (!u.password) return "has no password";
      if (u.port !== "6543") {
        return `port is ${u.port || "unset"} — the Worker needs the POOLED string on 6543`;
      }

      /**
       * Host, port and username have to agree.
       *
       * Supabase offers two endpoints with different username conventions, and
       * mixing them fails at authentication with "password authentication
       * failed for user postgres" — which sends you off resetting a password
       * that was never wrong. The pooler multiplexes many projects onto one
       * hostname and reads the project ref out of the username, so it needs
       * `postgres.<ref>`; the direct host is already project-specific and takes
       * plain `postgres`.
       */
      const pooled = u.hostname.includes("pooler.supabase.com");
      if (pooled && !/^postgres\.[a-z0-9]+$/.test(u.username)) {
        return (
          `user is "${u.username}" but the pooler needs "postgres.<project-ref>" — ` +
          `copy the Transaction pooler URI rather than editing the direct one`
        );
      }
      if (!pooled && u.hostname.startsWith("db.")) {
        return (
          `host "${u.hostname}" is the DIRECT endpoint but the port is 6543 — ` +
          `use the Transaction pooler host, or port 5432 with this host`
        );
      }
      return null;
    },
  },
  SUPABASE_URL: {
    label: "project URL",
    check: (v) => {
      let u: URL;
      try {
        u = new URL(v);
      } catch {
        return `not a URL (${v.length} chars) — expected https://<ref>.supabase.co`;
      }
      if (u.protocol !== "https:") return `scheme is "${u.protocol.replace(":", "")}", expected https`;
      if (!u.hostname.endsWith(".supabase.co")) return `host is "${u.hostname}", expected <ref>.supabase.co`;
      if (u.pathname !== "/") return "should have no path — just the origin";
      return null;
    },
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    label: "service role key",
    check: (v) => {
      // Supabase issues either a JWT (three dot-separated parts) or the newer
      // sb_secret_ format. Both are long; a short value is a failed paste.
      const isJwt = v.split(".").length === 3;
      const isNew = v.startsWith("sb_secret_");
      if (!isJwt && !isNew) return `neither a JWT nor an sb_secret_ key (${v.length} chars)`;
      if (v.length < 40) return `only ${v.length} chars — too short, the paste was truncated`;
      if (v.startsWith("eyJ") && v.includes("anon")) return "looks like the ANON key, not service_role";
      return null;
    },
  },
  ADMIN_PASSWORD: {
    label: "admin password",
    check: (v) => {
      if (v.length < 12) return `only ${v.length} chars — use at least 12`;
      if (/^strive$/i.test(v)) return "is still the development default";
      return null;
    },
  },
};

let failed = 0;
const seen = new Set<string>();

for (const [name, { label, check }] of Object.entries(checks)) {
  const value = doc[name];
  seen.add(name);

  if (value === undefined) {
    console.log(`  ✗ ${name}\n      missing from the file`);
    failed++;
    continue;
  }
  if (typeof value !== "string") {
    console.log(`  ✗ ${name}\n      must be a string`);
    failed++;
    continue;
  }
  if (/^PASTE_|_HERE$/.test(value)) {
    console.log(`  ✗ ${name}\n      still the placeholder — paste the real ${label}`);
    failed++;
    continue;
  }

  const problem = check(value);
  if (problem) {
    console.log(`  ✗ ${name}  (${value.length} chars)\n      ${problem}`);
    failed++;
  } else {
    console.log(`  ✓ ${name}  (${value.length} chars, ${label})`);
  }
}

for (const name of Object.keys(doc)) {
  if (!seen.has(name)) console.log(`  · ${name}  (not checked, will still upload)`);
}

console.log();
if (failed === 0) {
  console.log("✓ All values look right. Upload with:");
  console.log(`    npx wrangler secret bulk ${file}`);
  console.log("\n  Then DELETE the file — it holds your credentials in plain text.");
} else {
  console.log(`✗ ${failed} problem${failed === 1 ? "" : "s"} — fix the file and run this again.`);
  process.exit(1);
}
