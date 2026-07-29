/** Row shapes mirroring src/lib/schema.sql. */

export type ItemStatus =
  | "draft"
  /** Created by the client in their own portal — a proposal awaiting Strive. */
  | "requested"
  | "in_review"
  | "approved"
  | "changes_requested"
  | "scheduled"
  | "published";

export type CalendarStatus = "draft" | "in_review" | "approved" | "changes_requested";
export type ItemType = "post" | "asset";
export type Decision = "approved" | "changes_requested" | "undone";
export type Actor = "client" | "admin_on_behalf";
export type AuthorType = "admin" | "client";

/** Statuses the client is being asked to act on. */
export const PENDING_STATUSES: ItemStatus[] = ["in_review"];

/**
 * Statuses visible in the client portal. Drafts stay private to Strive;
 * 'requested' is included because the client wrote it themselves.
 */
export const CLIENT_VISIBLE_STATUSES: ItemStatus[] = [
  "requested",
  "in_review",
  "approved",
  "changes_requested",
  "scheduled",
  "published",
];

export type Client = {
  id: string;
  name: string;
  slug: string;
  metricool_blog_id: string | number | null;
  timezone: string;
  brand_color: string;
  logo_url: string | null;
  /** Storage key for an uploaded logo. Served via /api/logo/[clientId]. */
  logo_path: string | null;
  /** Per-network handles, e.g. { instagram: "encoreforhumanity" }. */
  handles: Record<string, string>;
  portal_token: string;
  archived_at: Date | null;
  created_at: Date;
};

export type ContentPillar = {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
  archived_at: Date | null;
  created_at: Date;
};

export type SmartGoal = {
  id: string;
  client_id: string;
  title: string;
  why: string;
  metric: string;
  unit: string;
  baseline: number;
  target: number;
  manual_current: number | null;
  /** When set, current value is read from analytics instead of typed in. */
  source_metric: string | null;
  source_network: string | null;
  starts_on: string;
  due_on: string;
  status: "active" | "achieved" | "missed" | "paused";
  created_at: Date;
};

export type CalendarEvent = {
  id: string;
  client_id: string;
  title: string;
  notes: string;
  color: string;
  /** 'YYYY-MM-DD'. */
  starts_on: string;
  ends_on: string | null;
  created_at: Date;
};

/** A per-platform caption override. Absent = use the item's master caption. */
export type ItemVariant = {
  id: string;
  item_id: string;
  platform: string;
  caption: string;
  hashtags: string[];
  updated_at: Date;
};

export type ClientStrategy = {
  client_id: string;
  positioning: string;
  audience: string;
  voice: string;
  notes: string;
  updated_at: Date;
};

export type Calendar = {
  id: string;
  client_id: string;
  month: string;
  title: string | null;
  status: CalendarStatus;
  sent_at: Date | null;
  approved_at: Date | null;
  created_at: Date;
};

export type Item = {
  id: string;
  client_id: string;
  calendar_id: string | null;
  type: ItemType;
  title: string | null;
  caption: string;
  platforms: string[];
  labels: string[];
  hashtags: string[];
  format: string;
  pillar_id: string | null;
  scheduled_for: Date | null;
  status: ItemStatus;
  position: number;
  internal_note: string | null;
  created_by: "admin" | "client";
  created_at: Date;
  updated_at: Date;
};

export type Idea = {
  id: string;
  /** null = shared workspace library; set = that client's own list. */
  client_id: string | null;
  title: string;
  notes: string;
  hashtags: string[];
  platforms: string[];
  source: "admin" | "client";
  status: "open" | "used" | "archived";
  used_item_id: string | null;
  created_at: Date;
};

export type Competitor = {
  id: string;
  client_id: string;
  network: string;
  handle: string;
  display_name: string | null;
  profile_url: string | null;
  notes: string | null;
  created_at: Date;
};

export type CompetitorSnapshot = {
  competitor_id: string;
  date: string;
  followers: number | null;
  posts: number | null;
  likes: number | null;
  engagement: number | null;
  source: "manual" | "metricool";
  created_at: Date;
};

export type ItemMedia = {
  id: string;
  item_id: string;
  storage_path: string;
  thumb_path: string | null;
  mime_type: string;
  file_name: string | null;
  byte_size: string | number | null;
  width: number | null;
  height: number | null;
  page_count: number | null;
  position: number;
  created_at: Date;
};

export type Comment = {
  id: string;
  item_id: string;
  media_id: string | null;
  author_type: AuthorType;
  author_name: string | null;
  body: string;
  anchor_x: number | null;
  anchor_y: number | null;
  page: number | null;
  resolved_at: Date | null;
  created_at: Date;
};

export type Approval = {
  id: string;
  client_id: string;
  item_id: string | null;
  calendar_id: string | null;
  decision: Decision;
  actor: Actor;
  actor_name: string | null;
  note: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
};

export type AnalyticsSnapshot = {
  client_id: string;
  network: string;
  metric: string;
  date: string;
  value: number;
  fetched_at: Date;
};

export type AnalyticsPost = {
  id: string;
  client_id: string;
  network: string;
  external_id: string;
  permalink: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  published_at: Date | null;
  metrics: Record<string, number>;
  fetched_at: Date;
};

export type SyncRun = {
  id: string;
  source: string;
  started_at: Date;
  finished_at: Date | null;
  status: "running" | "ok" | "error";
  rows_written: number;
  error: string | null;
};

/** An item joined with its media — what both portal and admin views render. */
export type ItemWithMedia = Item & { media: ItemMedia[] };

export const PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
  "twitter",
  "threads",
  "pinterest",
] as const;

export type Platform = (typeof PLATFORMS)[number];
