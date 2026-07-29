-- Strive Media client portal — full schema.
--
-- This exact file runs against both PGlite (local dev) and Supabase Postgres
-- (production). Keep it dialect-plain: no Supabase-specific extensions, no
-- PG enums (CHECK constraints migrate far more easily), no RLS policies here
-- (see 002_rls.sql — RLS is deny-all because all access is server-side).

create table if not exists clients (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null unique,
  metricool_blog_id  bigint unique,
  timezone           text not null default 'America/New_York',
  brand_color        text not null default '#111827',
  logo_url           text,
  -- The credential for the whole no-login portal. 32 random bytes, base64url.
  portal_token       text not null unique,
  archived_at        timestamptz,
  created_at         timestamptz not null default now()
);

create table if not exists client_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  name       text not null,
  email      text not null,
  notify     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (client_id, email)
);

-- A monthly batch of content. Clients can approve the whole month in one action.
create table if not exists calendars (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  month       date not null,                    -- always the 1st of the month
  title       text,
  status      text not null default 'draft'
                check (status in ('draft','in_review','approved','changes_requested')),
  sent_at     timestamptz,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (client_id, month)
);

-- The approvable unit: a social post, or a static asset/doc.
create table if not exists items (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  calendar_id   uuid references calendars(id) on delete set null,
  type          text not null default 'post' check (type in ('post','asset')),
  title         text,
  caption       text not null default '',
  platforms     text[] not null default '{}',
  labels        text[] not null default '{}',
  scheduled_for timestamptz,
  status        text not null default 'draft'
                  check (status in ('draft','in_review','approved',
                                    'changes_requested','scheduled','published')),
  position      integer not null default 0,
  internal_note text,                            -- never shown in the client portal
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists items_client_status_idx on items (client_id, status);
create index if not exists items_calendar_idx      on items (calendar_id, position);
create index if not exists items_scheduled_idx     on items (client_id, scheduled_for);

create table if not exists item_media (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items(id) on delete cascade,
  storage_path text not null,
  thumb_path   text,
  mime_type    text not null,
  file_name    text,
  byte_size    bigint,
  width        integer,
  height       integer,
  page_count   integer,                          -- PDFs
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists item_media_item_idx on item_media (item_id, position);

create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  media_id    uuid references item_media(id) on delete cascade,
  author_type text not null check (author_type in ('admin','client')),
  author_name text,
  body        text not null,
  -- Optional pin-point anchor for comments on an image or PDF page.
  anchor_x    real,
  anchor_y    real,
  page        integer,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists comments_item_idx on comments (item_id, created_at);

-- Append-only audit log. This is the reason a portal beats a DM thread:
-- it answers "who approved this, and when" months later.
create table if not exists approvals (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  item_id     uuid references items(id) on delete cascade,
  calendar_id uuid references calendars(id) on delete cascade,
  decision    text not null check (decision in ('approved','changes_requested','undone')),
  actor       text not null check (actor in ('client','admin_on_behalf')),
  actor_name  text,
  note        text,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  constraint approvals_target_ck check (item_id is not null or calendar_id is not null)
);

create index if not exists approvals_item_idx   on approvals (item_id, created_at desc);
create index if not exists approvals_client_idx on approvals (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Analytics. Written only by /api/ingest/metricool, read only by dashboards.
-- Deliberately provider-agnostic: nothing here names Metricool.
-- ---------------------------------------------------------------------------

create table if not exists analytics_snapshots (
  client_id  uuid not null references clients(id) on delete cascade,
  network    text not null,
  metric     text not null,
  date       date not null,
  value      double precision not null,
  fetched_at timestamptz not null default now(),
  primary key (client_id, network, metric, date)   -- makes re-sync idempotent
);

create index if not exists analytics_snapshots_lookup_idx
  on analytics_snapshots (client_id, network, metric, date desc);

create table if not exists analytics_posts (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  network       text not null,
  external_id   text not null,
  permalink     text,
  thumbnail_url text,
  caption       text,
  published_at  timestamptz,
  metrics       jsonb not null default '{}'::jsonb,
  fetched_at    timestamptz not null default now(),
  unique (client_id, network, external_id)
);

create index if not exists analytics_posts_recent_idx
  on analytics_posts (client_id, published_at desc);

-- Lets the dashboard show "Synced 6h ago" instead of implying live data.
create table if not exists sync_runs (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running'
                 check (status in ('running','ok','error')),
  rows_written integer not null default 0,
  error        text
);

create index if not exists sync_runs_recent_idx on sync_runs (source, started_at desc);

-- Dedupe guard so reminder cron can't double-send.
create table if not exists notifications_log (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  kind        text not null,
  target_id   uuid,
  sent_to     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_log_dedupe_idx
  on notifications_log (client_id, kind, target_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Migration 002 — client-submitted posts, hashtags, ideas, competitors.
--
-- Written as idempotent ALTERs appended to the same file so `db:migrate` works
-- identically on a fresh database and on one that already holds real approvals.
-- ---------------------------------------------------------------------------

alter table items add column if not exists hashtags text[] not null default '{}';

-- 'requested' = created by the client in their own portal. It is a proposal,
-- never something scheduled: it lands in Strive's queue and only becomes
-- in_review after a human has looked at it.
alter table items drop constraint if exists items_status_check;
alter table items add constraint items_status_check
  check (status in ('draft','requested','in_review','approved',
                    'changes_requested','scheduled','published'));

alter table items add column if not exists created_by text not null default 'admin'
  check (created_by in ('admin','client'));

-- Evergreen idea bank. client_id null = shared across the whole workspace;
-- set = that client's own list. Clients never see the shared bank.
create table if not exists ideas (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references clients(id) on delete cascade,
  title      text not null,
  notes      text not null default '',
  hashtags   text[] not null default '{}',
  platforms  text[] not null default '{}',
  source     text not null default 'admin' check (source in ('admin','client')),
  status     text not null default 'open' check (status in ('open','used','archived')),
  used_item_id uuid references items(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ideas_scope_idx on ideas (client_id, status, created_at desc);

-- Competitor tracking. Entered by hand rather than synced: Metricool exposes a
-- competitor feed, but no competitors are configured on any brand, so manual
-- entry is what actually produces data today. competitor_snapshots is shaped so
-- a Metricool sync can write to it later without changing the UI.
create table if not exists competitors (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  network      text not null,
  handle       text not null,
  display_name text,
  profile_url  text,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (client_id, network, handle)
);

create table if not exists competitor_snapshots (
  competitor_id uuid not null references competitors(id) on delete cascade,
  date          date not null,
  followers     double precision,
  posts         double precision,
  likes         double precision,
  engagement    double precision,
  source        text not null default 'manual' check (source in ('manual','metricool')),
  created_at    timestamptz not null default now(),
  primary key (competitor_id, date)
);

create index if not exists competitor_snapshots_recent_idx
  on competitor_snapshots (competitor_id, date desc);

-- ---------------------------------------------------------------------------
-- Migration 003 — post format.
--
-- `type` stays the coarse split (a social post vs a document to sign off).
-- `format` is how the post is published, which changes the preview, the aspect
-- ratio, and the caption limits.
-- ---------------------------------------------------------------------------

alter table items add column if not exists format text not null default 'post';
alter table items drop constraint if exists items_format_check;
alter table items add constraint items_format_check
  check (format in ('post','video','story','reel','carousel'));

-- ---------------------------------------------------------------------------
-- Migration 004 — content pillars, strategy, SMART goals, client logos,
-- and the social handles shown on post cards.
-- ---------------------------------------------------------------------------

-- Storage key for an uploaded logo. logo_url stays for external URLs.
alter table clients add column if not exists logo_path text;

-- Per-network handles, e.g. {"instagram": "encoreforhumanity"}. Shown on post
-- cards and in previews so a post reads as the account it will publish from.
alter table clients add column if not exists handles jsonb not null default '{}'::jsonb;

/* Content pillars are defined per client rather than globally: "Impact" means
   something different for a nonprofit than for a retailer, and the whole point
   is that Strive names them. */
create table if not exists content_pillars (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  description text,
  color       text not null default '#78716c',
  position    integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (client_id, name)
);

create index if not exists content_pillars_client_idx
  on content_pillars (client_id, position);

-- on delete set null: retiring a pillar must never delete the posts under it.
alter table items add column if not exists pillar_id uuid
  references content_pillars(id) on delete set null;

create index if not exists items_pillar_idx on items (pillar_id);

/* One strategy document per client. Free text by design — a strategy that has
   to fit a schema stops being a strategy. */
create table if not exists client_strategy (
  client_id   uuid primary key references clients(id) on delete cascade,
  positioning text not null default '',
  audience    text not null default '',
  voice       text not null default '',
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);

/* SMART goals.
   specific  -> title
   measurable-> metric + baseline + target + unit
   achievable/relevant -> why
   time-bound-> starts_on + due_on

   When source_metric is set the current value is read from analytics_snapshots
   instead of being typed in, so progress can't quietly go stale. */
create table if not exists smart_goals (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  title         text not null,
  why           text not null default '',
  metric        text not null default '',
  unit          text not null default '',
  baseline      double precision not null default 0,
  target        double precision not null,
  manual_current double precision,
  source_metric text,
  source_network text,
  starts_on     date not null default current_date,
  due_on        date not null,
  status        text not null default 'active'
                  check (status in ('active','achieved','missed','paused')),
  created_at    timestamptz not null default now(),
  constraint smart_goals_window_ck check (due_on >= starts_on)
);

create index if not exists smart_goals_client_idx
  on smart_goals (client_id, status, due_on);

-- ---------------------------------------------------------------------------
-- Migration 005 — per-channel captions and calendar events.
-- ---------------------------------------------------------------------------

/* A post going to three networks is usually three different pieces of writing:
   LinkedIn wants context, Instagram wants a hook, X wants brevity. The item
   holds the master caption; a variant overrides it for one platform. No row
   means "use the master", so adding variants never breaks existing posts. */
create table if not exists item_variants (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items(id) on delete cascade,
  platform   text not null,
  caption    text not null default '',
  hashtags   text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (item_id, platform)
);

create index if not exists item_variants_item_idx on item_variants (item_id);

/* Campaigns, holidays, off-weeks — context the calendar needs but that isn't a
   post. Spans a range so a two-week campaign renders across its whole run. */
create table if not exists calendar_events (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  title      text not null,
  notes      text not null default '',
  color      text not null default '#a3a19b',
  starts_on  date not null,
  ends_on    date,
  created_at timestamptz not null default now(),
  constraint calendar_events_range_ck check (ends_on is null or ends_on >= starts_on)
);

create index if not exists calendar_events_range_idx
  on calendar_events (client_id, starts_on, ends_on);

-- ---------------------------------------------------------------------------
-- Migration 006 — workspace appearance.
--
-- Branding lives in the database, not in env vars, so it can be changed from
-- the UI after deploy without a rebuild. Single row, id fixed to 1.
-- ---------------------------------------------------------------------------

create table if not exists workspace (
  id            integer primary key default 1 check (id = 1),
  name          text not null default 'Strive Media Co.',
  accent        text not null default '#1c1917',
  sidebar_bg    text not null default '#eae8e3',
  page_bg       text not null default '#eae8e3',
  logo_path     text,
  updated_at    timestamptz not null default now()
);

insert into workspace (id) values (1) on conflict (id) do nothing;
