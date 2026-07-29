# Strive Media — Client Portal

Per-client content approval + analytics. Clients get one permanent link, no
login, and approve a post in a single tap from their phone.

- **Admin** (`/admin`) — Strive staff. Sidebar workspace: Home, Content (every
  client on one timeline), Ideas, Analytics; each client expands to their
  Content, Competitors, and live Portal link.
- **Client portal** (`/p/<token>`) — one unguessable link per client. Tabs for
  Approvals, Content, New post, and Analytics. No account, nothing to install.

## What lives where

| Surface | Route | Who |
|---|---|---|
| Workspace home | `/admin` | Strive |
| All-client timeline | `/admin/content` | Strive |
| Evergreen idea bank | `/admin/ideas` | Strive |
| Cross-client analytics | `/admin/analytics` | Strive |
| Client calendar | `/admin/c/<slug>` | Strive |
| Strategy + SMART goals | `/admin/c/<slug>/strategy` | Strive |
| Competitor tracking | `/admin/c/<slug>/competitors` | Strive |
| Client settings | `/admin/c/<slug>/settings` | Strive |
| Approvals queue | `/p/<token>` | Client |
| Content calendar | `/p/<token>/content` → `/m/<id>` | Client |
| Write a post | `/p/<token>/new` | Client |
| Analytics | `/p/<token>/analytics` | Client |

---

## Quick start

```bash
npm install
npm run db:reset      # creates the schema and seeds the 5 Metricool brands
npm run dev
npm run db:links      # prints each client's portal URL (stop the dev server first)
```

Admin password in development is `strive` (`ADMIN_PASSWORD` in `.env.local`).

> **PGlite is single-writer.** With no `DATABASE_URL` set, the database is a local
> PGlite directory (`.data/pgdata`) that only one process may open. Stop the dev
> server before running `db:*` or `verify`. Once `DATABASE_URL` points at
> Supabase this restriction disappears.

---

## How the database works

One SQL surface, two drivers — see [`src/lib/db-core.ts`](src/lib/db-core.ts):

| `DATABASE_URL` | Driver | Used for |
|---|---|---|
| unset | **PGlite** — real Postgres compiled to WASM, no Docker | local development |
| set | **postgres.js** | Supabase / any Postgres |

[`src/lib/schema.sql`](src/lib/schema.sql) is plain Postgres and runs unchanged
against both, so what you test locally is what ships.

The `sql` tagged template turns **every interpolation into a bound parameter** —
there is no string-concatenation path, by design.

---

## Security model

The portal has no login, so **the token is the credential**:

- `portal_token` is 32 random bytes (base64url) resolved server-side to exactly
  one `client_id`; every subsequent query filters on that id.
- Cross-client access returns **404, never 403** — a 403 would confirm the row exists.
- All portal traffic runs through server routes and Server Actions. **The browser
  never talks to Postgres**, and never sees the service-role key.
- Media has no public URL. [`/api/media/[id]`](src/app/api/media/[id]/route.ts)
  re-checks entitlement per request, so rotating a token revokes media access at
  the same moment.
- `/p/*` sends `noindex` and `Referrer-Policy: same-origin`.
- **Rotate link** in admin invalidates a leaked URL immediately.

---

## Analytics: how Metricool data actually arrives

The Metricool **MCP connector is OAuth-bound to a Claude account and has no
server-callable HTTP surface** — a Vercel function cannot fetch it. Metricool's
REST API *can* be called server-side, but needs an Advanced/Custom plan.

So the pipeline is:

```
Scheduled Claude agent (daily)
  → Metricool MCP: getAnalyticsDataByMetrics per brand
  → writes the raw rows to a JSON file
  → npm run sync:push <file>
      → POST /api/ingest/metricool   (Bearer INGEST_SECRET)
          → upsert analytics_snapshots  (idempotent)
              → dashboards read Postgres only
```

**The agent never interprets numbers.** Field-ID → metric mapping lives in
[`src/lib/metricool-map.ts`](src/lib/metricool-map.ts), in version control, so
the semantics are reviewable and can't drift between runs.

Payload format for `sync:push`:

```json
{
  "brandId": 4818244,
  "blocks": [
    { "fields": ["IGEV01", "IGEV06", "IGEV38"],
      "rows": [["318.0", "591.0", "29.0", "20260717"]] }
  ]
}
```

Check what landed:

```bash
curl -H "Authorization: Bearer $INGEST_SECRET" http://localhost:3000/api/ingest/metricool
```

Prune old snapshots (same bearer):

```bash
curl -X DELETE -H "Authorization: Bearer $INGEST_SECRET" "http://localhost:3000/api/ingest/metricool?before=2026-01-01"
```

The ingest endpoint is **provider-agnostic** — it accepts normalized rows and
knows nothing about Metricool. Moving to a direct REST sync later means adding
one script that POSTs the same shape: no schema or UI change.

Dashboards show **"Synced 6h ago"** rather than implying live data.

### Competitor analysis

Tracked per client at `/admin/c/<slug>/competitors`, with readings entered by
hand (followers, posts, avg likes, engagement %) and compared against the
client's own follower count.

Metricool *does* expose a competitor feed (`IGCO*` fields — screen name,
followers, posts, likes, engagement), but **no competitors are configured on any
brand**, so it returns zero rows. `competitor_snapshots` carries a
`source` column (`manual` | `metricool`) and is keyed on
`(competitor_id, date)`, so a sync can start writing to it later without a
migration or a UI change.

### Known data gaps (Metricool-side, not bugs)

- **Facebook reach** (`FBEV20`) returns null for every brand, so there is no
  Facebook line on the reach chart.
- **LinkedIn** reports impressions, not reach. Mapped honestly as `impressions`,
  so LinkedIn is absent from the reach chart rather than mislabelled.
- **Brand 6239290** has no label in Metricool and is seeded as "Untitled Brand".

---

## The calendar

The month grid is the page, not a widget above one. Both Strive and the client
get the same three views, switched by `?view=`:

| View | What it's for |
|---|---|
| **Calendar** (default) | Six fixed rows of seven. Posts are cards inside their day cell — status dot, platform marks, title. |
| **Grid** | The feed as it will look. Squares in scheduled order, so you can see the rhythm of a profile before it exists. |
| **List** | Date, time, thumbnail, status. The view for scanning a month quickly. |

State lives entirely in the URL (`?view=`, `?month=`, `?post=`), so any view of
any month with any post open is a link you can send someone.

Posts are bucketed by the day **the client** will see, using their timezone —
a 9pm ET post is not the next day just because the server thinks in UTC.

### The editor is a modal

Editing is a detour, not a destination: you're looking at a month, you open one
day, you go back to the month. The composer opens over the calendar
(`?post=<id>`) with the grid still visible behind it. `/admin/c/<slug>/i/<id>`
redirects into that modal so old links still work.

Inside: a platform rail, **Post / Internal / Activity** tabs, a Preview toggle,
and property rows for Status, Type, Schedule, Labels, Hashtags, and Media
(drag-and-drop). Activity holds the conversation and the approval history.

## How a client actually finds out

Email, not "go check the site" — clients don't habitually visit a portal, and
work that nobody looks at is work that stalls. But email only earns that role if
it stays rare:

- **Batch send.** Tick the posts you want on the calendar or list view and hit
  **Send for approval** once. Any number of posts, one email.
- **A 45-minute cooldown.** If you send posts one at a time anyway, the second
  and subsequent sends move the posts but send no further email. The client's
  existing link already shows everything pending, so a second notification would
  carry no new information — and would teach them to ignore the next one.
- **One reminder**, only if something has sat unreviewed for 3 days
  (`/api/cron/reminders`), rate-limited to one per client per 3 days.
- **Never per-post.** There is no code path that emails a client twice for two
  posts sent in the same sitting.

The send confirmation tells you which happened: *"3 posts sent — one email"* or
*"3 posts sent — added to their existing link, no second email"*.

Realistic month: a client gets **1–2 emails**, not 20.

## The friction budget

The client side is the product. Decisions that cost taps were rejected:

1. Email deep-links to the **first pending item**, not a dashboard.
2. **Approve is one tap, with no confirm dialog** — an Undo toast covers mistakes,
   where a confirm step would tax every approval to prevent a rare one.
3. Approving **advances to the next pending item**: six posts, six taps.
4. Typing is mandatory in exactly one place — *Request changes*, where the note
   is the whole point.
5. **Approve all** exists for clients who'd rather batch. Being bulk and less
   reversible, it *does* confirm.
6. State persists; reopening the link resumes where they left off.

### Client-authored posts

Clients get the same Notion-style composer Strive uses, with two differences
enforced server-side, not in the UI:

- Status is **fixed to `requested`** and `created_by` to `client`. Neither is
  read from the browser, so a client cannot author something already approved.
- The save guard is `created_by = 'client' AND status = 'requested'`. The moment
  Strive picks a request up, the client's write access to it ends.

Requests land in **Content → Needs you**, badged *their idea*. Media upload
follows the same rule: a client may attach artwork to their own open request and
nothing else.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:reset` | Drop, recreate, reseed |
| `npm run db:links` | Print all portal URLs |
| `npm run sync:push <file>` | Push Metricool rows |
| `npm run verify` | DB suite — isolation, draft privacy, audit trail, request guards (25 checks) |
| `npm run verify:http` | HTTP suite — ingest auth, idempotency, prune (13 checks) |

`verify` needs the dev server stopped (PGlite); `verify:http` needs it running.

---

## Environment

| Variable | Required | Notes |
|---|---|---|
| `APP_URL` | yes | Absolute base for portal links in emails |
| `ADMIN_PASSWORD` | yes | Admin sign-in |
| `SESSION_SECRET` | yes in prod | `openssl rand -base64 32`. Throws if missing in prod |
| `INGEST_SECRET` | yes | Bearer token for `/api/ingest/metricool` |
| `CRON_SECRET` | for reminders | Vercel Cron sends it as a bearer token |
| `DATABASE_URL` | prod | Unset → PGlite locally |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | prod | Unset → local disk storage |
| `SUPABASE_BUCKET` | no | Defaults to `media` |
| `ADMIN_NAME` | no | Name in the Home greeting |
| `ADMIN_TZ` | no | Timezone the greeting uses. Default `America/New_York` |
| `RESEND_API_KEY` | for email | **Unset → emails are logged, not sent** |
| `MAIL_FROM` | for email | Needs a verified Resend domain |
| `STAFF_EMAILS` | no | Comma-separated; alerted on change requests |

---

## Deploying

1. **Supabase** — create a project. Put the pooled connection string in
   `DATABASE_URL`, then `npm run db:migrate` to apply the schema. Create a
   **private** bucket named `media`.
2. **Vercel** — import the repo, set the env vars above.
3. **Resend** — verify `strivemediaco.com`, then set `RESEND_API_KEY` and
   `MAIL_FROM`. Everything except email works without this.
4. **Cron** — [`vercel.json`](vercel.json) runs the reminder sweep at 14:00 UTC on
   weekdays. Set `CRON_SECRET`.
5. Run `npm run db:links` and send each client their URL.

### Seeding production

`db:seed` inserts the five Metricool brands with fresh tokens plus demo content.
For a real deployment, seed and then delete the demo items from admin.

**Rotating a token changes a client's URL.** `db:reset` regenerates all of them —
never run it against production once clients have their links.

---

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · Tailwind 4 · Postgres
(PGlite / Supabase) · Recharts · Resend · sharp.

Chart colours are the validated categorical palette from the `dataviz` method:
worst adjacent-pair CVD ΔE 9.1, normal-vision ΔE 22.9. Two slots sit below 3:1
on white, so every line carries a **direct end-label**, a legend, and a table
view — identity is never carried by colour alone.
#   s t r i v e p o r t a l  
 