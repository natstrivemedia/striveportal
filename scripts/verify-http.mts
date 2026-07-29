/**
 * HTTP-level verification — the checks that need a running server.
 *
 *   npm run dev          (in another terminal)
 *   npm run verify:http
 *
 * Covers ingest auth, validation, idempotency, and cross-client isolation as
 * observed over the wire rather than in the database.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* defaults apply */
}

const base = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.INGEST_SECRET ?? "";
const auth = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function snapshotCount(clientName: string): Promise<number> {
  const res = await fetch(`${base}/api/ingest/metricool`, { headers: auth });
  const body = (await res.json()) as { clients: { name: string; snapshots: number }[] };
  return body.clients.find((c) => c.name === clientName)?.snapshots ?? 0;
}

console.log("\nStrive portal — HTTP verification\n");

// ---------------------------------------------------------------------------
console.log("Ingest authentication");

const noAuth = await fetch(`${base}/api/ingest/metricool`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
check("rejects a request with no bearer token", noAuth.status === 401, `got ${noAuth.status}`);

const badAuth = await fetch(`${base}/api/ingest/metricool`, {
  method: "POST",
  headers: { Authorization: "Bearer wrong-secret", "Content-Type": "application/json" },
  body: "{}",
});
check("rejects a wrong bearer token", badAuth.status === 401, `got ${badAuth.status}`);

// ---------------------------------------------------------------------------
console.log("\nIngest validation");

const badShape = await fetch(`${base}/api/ingest/metricool`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ snapshots: [{ network: "instagram", metric: "followers", date: "nope", value: 1 }] }),
});
check("rejects a malformed date", badShape.status === 422, `got ${badShape.status}`);

const unknown = await fetch(`${base}/api/ingest/metricool`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ blogId: 999999999, snapshots: [] }),
});
check("404s for an unknown client", unknown.status === 404, `got ${unknown.status}`);

// ---------------------------------------------------------------------------
console.log("\nIngest idempotency");

const payload = {
  blogId: 4818244,
  snapshots: [
    { network: "instagram", metric: "followers", date: "2026-01-15", value: 100 },
    { network: "instagram", metric: "followers", date: "2026-01-16", value: 101 },
    { network: "instagram", metric: "reach", date: "2026-01-15", value: 500 },
  ],
};

// Clear any leftovers from a previous run first, so "wrote 3 new rows" is a
// real assertion rather than a collision with the suite's own history.
await fetch(`${base}/api/ingest/metricool?before=2026-04-01`, {
  method: "DELETE",
  headers: auth,
});

const before = await snapshotCount("Encore for Humanity");

const first = await fetch(`${base}/api/ingest/metricool`, {
  method: "POST", headers: auth, body: JSON.stringify(payload),
});
check("first post succeeds", first.ok, `got ${first.status}`);
const afterFirst = await snapshotCount("Encore for Humanity");
check("first post wrote 3 new rows", afterFirst === before + 3, `${before} -> ${afterFirst}`);

const second = await fetch(`${base}/api/ingest/metricool`, {
  method: "POST", headers: auth, body: JSON.stringify(payload),
});
check("replaying the same payload succeeds", second.ok, `got ${second.status}`);
const afterSecond = await snapshotCount("Encore for Humanity");
check(
  "replaying adds no rows (idempotent)",
  afterSecond === afterFirst,
  `${afterFirst} -> ${afterSecond}`,
);

// Updating a value must overwrite in place, not append.
const updated = { ...payload, snapshots: [{ ...payload.snapshots[0], value: 999 }] };
await fetch(`${base}/api/ingest/metricool`, {
  method: "POST", headers: auth, body: JSON.stringify(updated),
});
const afterUpdate = await snapshotCount("Encore for Humanity");
check("re-posting a changed value updates in place", afterUpdate === afterSecond,
  `${afterSecond} -> ${afterUpdate}`);

// ---------------------------------------------------------------------------
console.log("\nPortal isolation over HTTP");

const links = await fetch(`${base}/api/ingest/metricool`, { headers: auth });
check("status endpoint requires auth", links.ok);

const badToken = await fetch(`${base}/p/not-a-real-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa`);
check("an invalid portal token 404s", badToken.status === 404, `got ${badToken.status}`);

const shortToken = await fetch(`${base}/p/abc`);
check("a too-short token 404s without a DB hit", shortToken.status === 404, `got ${shortToken.status}`);

// Leave the database as we found it — real analytics start in April 2026.
const pruned = await fetch(`${base}/api/ingest/metricool?before=2026-04-01`, {
  method: "DELETE",
  headers: auth,
});
check("suite cleans up its own test rows", pruned.ok);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed > 0 ? 1 : 0;
