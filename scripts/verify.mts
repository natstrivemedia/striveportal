/**
 * Verification suite — the checks named in the build plan.
 *
 *   node scripts/verify.mts
 *
 * Runs against the database directly, so the dev server must be STOPPED when
 * using PGlite (single writer). Against Supabase (DATABASE_URL set) it can run
 * any time.
 *
 * The ingest-idempotency check needs a live HTTP server and lives in
 * scripts/verify-http.mts instead.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* defaults apply */
}

const { sql, closeDb } = await import("../src/lib/db-core.ts");
const q = await import("../src/lib/queries.ts");

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

console.log("\nStrive portal verification\n");

// ---------------------------------------------------------------------------
console.log("Client isolation");

const clients = await sql<{ id: string; name: string; portal_token: string }>`
  select id, name, portal_token from clients order by name
`;
check("at least two clients exist to test against", clients.length >= 2);

const [a, b] = clients;
const aItems = await q.listAllItems(a.id);
const bItems = await q.listAllItems(b.id);

check(
  "each client has its own items",
  aItems.length > 0 && bItems.length > 0,
  `${a.name}=${aItems.length} ${b.name}=${bItems.length}`,
);

// The core isolation guarantee: B's item id, scoped to A, must not resolve.
const crossTenant = await q.getItem(a.id, bItems[0].id);
check(
  "client A cannot read client B's item by id",
  crossTenant === null,
  crossTenant ? "LEAK: returned a row" : "",
);

const ownItem = await q.getItem(a.id, aItems[0].id);
check("client A can read its own item", ownItem !== null);

// No item may ever be reachable from a client that doesn't own it.
const orphans = await sql<{ n: string }>`
  select count(*)::text as n from items i
  join clients c on c.id = i.client_id
  where c.archived_at is not null
`;
check("no items belong to archived clients", Number(orphans[0].n) === 0);

// ---------------------------------------------------------------------------
console.log("\nDraft privacy");

// The suite creates its own draft rather than relying on seed state — whether
// a draft happens to exist depends on what anyone did in the UI last.
const [ownDraft] = await sql<{ id: string }>`
  insert into items (client_id, type, title, caption, status)
  values (${a.id}, 'post', 'verify-suite draft', 'private', 'draft')
  returning id
`;

const draftIds = await sql<{ id: string; client_id: string }>`
  select id, client_id from items where status = 'draft' limit 5
`;
check("a draft exists to test against", draftIds.length > 0);

let draftLeak = false;
for (const d of draftIds) {
  const visible = await q.getClientVisibleItem(d.client_id, d.id);
  if (visible) draftLeak = true;
}
check("drafts are invisible to the client portal", !draftLeak);

const visibleList = await q.listClientVisibleItems(a.id);
check(
  "client-visible list excludes drafts",
  visibleList.every((i) => i.status !== "draft"),
);
check(
  "the draft is visible to admin",
  (await q.listAllItems(a.id)).some((i) => i.id === ownDraft.id),
);

await sql`delete from items where id = ${ownDraft.id}`;

// ---------------------------------------------------------------------------
console.log("\nApproval audit trail");

const target = (await q.listClientVisibleItems(a.id)).find((i) => i.status === "in_review");
check("found an in_review item to approve", Boolean(target));

if (target) {
  await sql`
    update items set status = 'approved' where id = ${target.id} and client_id = ${a.id}
  `;
  await sql`
    insert into approvals (client_id, item_id, decision, actor, ip, user_agent)
    values (${a.id}, ${target.id}, 'approved', 'client', '203.0.113.9', 'verify-suite')
  `;

  const [rec] = await sql<{
    decision: string; actor: string; ip: string; created_at: Date;
  }>`
    select decision, actor, ip, created_at from approvals
    where item_id = ${target.id} order by created_at desc limit 1
  `;

  check("approval records the decision", rec?.decision === "approved");
  check("approval records the actor", rec?.actor === "client");
  check("approval records the IP", rec?.ip === "203.0.113.9");
  check("approval records a timestamp", Boolean(rec?.created_at));

  // Restore so the seed stays pristine for handoff.
  await sql`delete from approvals where item_id = ${target.id} and user_agent = 'verify-suite'`;
  await sql`update items set status = 'in_review' where id = ${target.id}`;
}

// ---------------------------------------------------------------------------
console.log("\nClient-authored requests");

// A client's composer writes through exactly this guard. Testing the guard
// itself is the point: it is the only thing standing between "client proposes"
// and "client publishes".
const [clientItem] = await sql<{ id: string }>`
  insert into items (client_id, type, caption, status, created_by)
  values (${a.id}, 'post', 'verify-suite request', 'requested', 'client')
  returning id
`;

const editOwn = await sql<{ id: string }>`
  update items set caption = 'edited by client'
  where id = ${clientItem.id} and client_id = ${a.id}
    and created_by = 'client' and status = 'requested'
  returning id
`;
check("client can edit their own pending request", editOwn.length === 1);

// Same guard, against an item Strive authored.
const adminItem = aItems.find((i) => i.created_by !== "client");
if (adminItem) {
  const editAdmins = await sql<{ id: string }>`
    update items set caption = 'edited by client'
    where id = ${adminItem.id} and client_id = ${a.id}
      and created_by = 'client' and status = 'requested'
    returning id
  `;
  check("client cannot edit a Strive-authored post", editAdmins.length === 0);
}

// Once Strive picks it up, the client loses write access to their own request.
await sql`update items set status = 'in_review' where id = ${clientItem.id}`;
const editAfterPickup = await sql<{ id: string }>`
  update items set caption = 'edited too late'
  where id = ${clientItem.id} and client_id = ${a.id}
    and created_by = 'client' and status = 'requested'
  returning id
`;
check("client cannot edit a request once it moves to review", editAfterPickup.length === 0);

check(
  "'requested' is a legal status",
  await sql`select 1 from items where id = ${clientItem.id}`.then((r) => r.length === 1),
);

await sql`delete from items where id = ${clientItem.id}`;

// ---------------------------------------------------------------------------
console.log("\nIdeas and competitors");

const [sharedIdea] = await sql<{ id: string; client_id: string | null }>`
  insert into ideas (client_id, title, notes) values (null, 'verify-suite idea', '')
  returning id, client_id
`;
check("a shared idea has no client scope", sharedIdea.client_id === null);
await sql`delete from ideas where id = ${sharedIdea.id}`;

const [comp] = await sql<{ id: string }>`
  insert into competitors (client_id, network, handle)
  values (${a.id}, 'instagram', 'verify-suite-handle')
  on conflict (client_id, network, handle) do update set handle = excluded.handle
  returning id
`;
for (let i = 0; i < 2; i++) {
  await sql`
    insert into competitor_snapshots (competitor_id, date, followers)
    values (${comp.id}, '2026-01-02'::date, ${1000 + i})
    on conflict (competitor_id, date) do update set followers = excluded.followers
  `;
}
const snaps = await sql<{ followers: number }>`
  select followers from competitor_snapshots where competitor_id = ${comp.id}
`;
check("re-logging a competitor date updates rather than duplicates", snaps.length === 1);
check("the update wins", Number(snaps[0]?.followers) === 1001);
await sql`delete from competitors where id = ${comp.id}`;

// ---------------------------------------------------------------------------
console.log("\nSchema guarantees");

let rejectedBadStatus = false;
try {
  await sql`
    update items set status = 'not-a-real-status' where id = ${aItems[0].id}
  `;
} catch {
  rejectedBadStatus = true;
}
check("status CHECK constraint rejects invalid values", rejectedBadStatus);

let rejectedOrphanApproval = false;
try {
  await sql`
    insert into approvals (client_id, decision, actor) values (${a.id}, 'approved', 'client')
  `;
} catch {
  rejectedOrphanApproval = true;
}
check("approvals require an item or calendar target", rejectedOrphanApproval);

const tokens = await sql<{ portal_token: string }>`select portal_token from clients`;
check(
  "every portal token is at least 40 chars",
  tokens.every((t) => t.portal_token.length >= 40),
);
check(
  "portal tokens are unique",
  new Set(tokens.map((t) => t.portal_token)).size === tokens.length,
);

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
await closeDb();
process.exitCode = failed > 0 ? 1 : 0;
