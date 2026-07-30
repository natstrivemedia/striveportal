/**
 * Report row-level-security state for every table.
 *
 * Supabase serves `public` over PostgREST to the `anon` role, whose key is
 * public by design. RLS off on a table there means that table is readable by
 * anyone holding that key, so "is RLS on" is a security property worth being
 * able to check on demand rather than trusting a migration ran.
 */
// A standalone script doesn't get Next's .env.local loading. Without this the
// driver finds no DATABASE_URL and silently reports on local PGlite instead of
// Supabase — which is a security check answering about the wrong database.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local — PGlite defaults apply */
}

const { sql, closeDb } = await import("../src/lib/db-core.ts");

// Always say which database was inspected. The whole value of this check is
// knowing production is locked down; "20/20 protected" about the wrong target
// is worse than no answer.
console.log(
  `Target: ${process.env.DATABASE_URL ? "Supabase Postgres" : "PGlite (.data/pgdata)"}\n`,
);

const rows = await sql<{ tablename: string; rowsecurity: boolean }>`
  select tablename, rowsecurity
  from pg_tables
  where schemaname = 'public'
  order by tablename
`;

const off = rows.filter((r) => !r.rowsecurity);

for (const r of rows) {
  console.log(`  ${r.rowsecurity ? "✓ on " : "✗ OFF"}  ${r.tablename}`);
}

console.log(
  off.length === 0
    ? `\n✓ RLS enabled on all ${rows.length} tables`
    : `\n✗ ${off.length} of ${rows.length} tables UNPROTECTED: ${off.map((r) => r.tablename).join(", ")}`,
);

await closeDb();
process.exit(off.length === 0 ? 0 : 1);
