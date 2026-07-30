/**
 * End-to-end check that the deployed Worker can actually read the database.
 *
 * Fetches one real portal token and requests that portal over HTTPS. A 200 is
 * proof the Worker reached Postgres through the pooler and rendered client
 * rows; a 404 would mean the token lookup found nothing, and a 500 that the
 * connection or a query failed.
 *
 * Tokens are the entire credential for a portal, so this prints status codes
 * and never the token itself.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* PGlite defaults */
}

const { sql, closeDb } = await import("../src/lib/db-core.ts");

// Deliberately not APP_URL: that is localhost in .env.local, which would turn a
// production check into a check of whatever happens to be on port 3000.
const base = (process.argv[2] ?? "https://portal.strivemediaco.com").replace(/\/$/, "");
const clients = await sql<{ name: string; portal_token: string }>`
  select name, portal_token from clients order by name limit 1
`;

if (clients.length === 0) {
  console.log("No clients in the database — nothing to smoke-test.");
  await closeDb();
  process.exit(1);
}

const { name, portal_token } = clients[0];

for (const [label, path] of [
  ["login page   ", "/login"],
  ["client portal", `/p/${portal_token}`],
  ["bogus token  ", "/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
] as const) {
  const res = await fetch(base + path, { redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const mentions = body.includes(name);
  console.log(
    `  ${res.status}  ${label}` +
      (path.startsWith("/p/") && res.status === 200
        ? `  (renders client name: ${mentions ? "yes" : "NO"})`
        : ""),
  );
}

console.log(`\nTested ${base} against client "${name}".`);
await closeDb();
