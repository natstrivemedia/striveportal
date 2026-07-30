# Deploying

Target: **Cloudflare Workers** (hosting) + **Supabase** (Postgres + file storage)
+ **GitHub** (source). All three have free tiers that permit commercial use.

Roughly 45 minutes end to end. Steps 1–4 get you live; 5–7 make it production-ready.

---

## 1. GitHub

The repo is committed on `main` and has no remote yet.

```bash
gh repo create strive-portal --private --source=. --push
```

No `gh` CLI? Create an empty **private** repo on github.com, then:

```bash
git remote add origin https://github.com/<you>/strive-portal.git
git push -u origin main
```

> Keep it **private**. `.env.local` and `.data/` are gitignored, but the repo
> still describes your clients and your security model.

---

## 2. Supabase

1. Create a project at [supabase.com](https://supabase.com). Save the database
   password — it appears once, and the connection string contains
   `[YOUR-PASSWORD]` as a literal placeholder you must replace.
2. Click **Connect** at the top of the project dashboard. (It is no longer under
   Settings → Database.) You need **two** strings from this modal:
   - **Transaction pooler**, port `6543` — for the deployed app. Serverless
     opens many short-lived connections, which is what this pooler is for. It
     does not support prepared statements, which is why the driver sets
     `prepare: false`.
   - **Direct connection** (or **Session pooler** on IPv4-only networks),
     port `5432` — for running migrations from your machine.
3. **Storage → New bucket** → name it `media`, leave it **private**. The app
   never serves storage URLs directly; `/api/media/[id]` re-checks entitlement
   on every request.
4. **Settings → API** → copy the project URL and the `service_role` key.

Apply the schema from your machine, using the **direct** connection:

```bash
DATABASE_URL="postgresql://...@...:5432/postgres" npm run db:migrate
DATABASE_URL="postgresql://...@...:5432/postgres" npm run db:seed   # optional demo clients
```

The app itself gets the **pooled** string (`6543`) as its `DATABASE_URL` secret.

`src/lib/schema.sql` is plain Postgres and is the same file PGlite runs locally,
so nothing is translated on the way up.

> **Free tier pauses after 7 days of inactivity.** A paused project returns
> connection errors until you resume it in the dashboard. With a client portal
> in daily use this rarely bites, but it is worth knowing before a quiet week.

---

## 3. Cloudflare

```bash
npx wrangler login
```

Set each secret (values are never written to the repo):

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put SESSION_SECRET      # openssl rand -base64 32
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put INGEST_SECRET
npx wrangler secret put CRON_SECRET
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put APP_URL             # https://portal.yourdomain.com
npx wrangler secret put ADMIN_NAME
npx wrangler secret put RESEND_API_KEY      # step 5
npx wrangler secret put MAIL_FROM
```

Then:

```bash
npm run cf:preview   # runs the Workers build locally
npm run cf:deploy
```

### Why the config looks the way it does

`wrangler.jsonc` sets two compatibility flags, both required:

- **`nodejs_compat`** — postgres.js reaches Supabase over a TCP socket, which
  only exists on Workers with this flag.
- **`global_fetch_strictly_public`** — required by the OpenNext adapter.

---

## 4. Domain

Cloudflare dashboard → **Workers & Pages → strive-portal → Settings → Domains**
→ add `portal.yourdomain.com`. If the domain's nameservers are already on
Cloudflare, DNS and TLS are automatic.

Then set `APP_URL` to the final URL — portal links in emails are built from it.

---

## 5. Email (Resend)

Sign up, verify your sending domain, then set `RESEND_API_KEY` and `MAIL_FROM`.

**Without a key the app logs emails instead of sending them.** Everything else
works; clients just don't get notified.

---

## 6. Reminder cron

Workers cron is separate from `vercel.json`. Add to `wrangler.jsonc`:

```jsonc
"triggers": { "crons": ["0 14 * * 1-5"] }
```

and have the scheduled handler call `/api/cron/reminders` with
`Authorization: Bearer $CRON_SECRET`.

---

## 7. Before clients see it

- [ ] `ADMIN_PASSWORD` is not `strive`
- [ ] `SESSION_SECRET` is a real random value — the app **throws on boot** in
      production if it is missing, deliberately
- [ ] `npm run db:links` → send each client their URL
- [ ] Open one portal on a phone and approve a post
- [ ] Set your branding in **Appearance**

---

## What runs differently on Workers

| | Node (local / Vercel) | Cloudflare Workers |
|---|---|---|
| Database | PGlite file store | Supabase Postgres via postgres.js |
| File storage | `.data/uploads` | Supabase Storage |
| Image resizing | sharp | **skipped** — originals are stored as-is |

That last row is the only real behavioural difference. sharp is a native binary
and cannot run on Workers, so `src/lib/image.ts` detects the runtime and returns
the original bytes rather than failing. Uploads still work; they just aren't
downsized, and thumbnails fall back to the full image.

If that becomes a bandwidth problem, the fix is Cloudflare Images (~$5/mo) or
resizing in the browser before upload. It is not worth solving until it hurts.
