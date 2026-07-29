/**
 * Client portal access.
 *
 * There is no login, so the portal token IS the credential. The security model
 * rests on two rules, both enforced here rather than in page components:
 *
 *   1. A token resolves to exactly one client_id.
 *   2. Every subsequent query is filtered by that client_id.
 *
 * A client asking for another client's item id gets notFound() — a 404, not a
 * 403, because confirming "that row exists but isn't yours" is itself a leak.
 */
import "server-only";

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { one } from "./db";
import { looksLikePortalToken } from "./tokens";
import type { Client } from "./types";

export async function resolveClient(token: string): Promise<Client | null> {
  // Cheap shape check before touching the database with an arbitrary URL segment.
  if (!looksLikePortalToken(token)) return null;
  return one<Client>`
    select * from clients
    where portal_token = ${token} and archived_at is null
  `;
}

/** Use at the top of every portal route. 404s rather than leaking existence. */
export async function requireClient(token: string): Promise<Client> {
  const client = await resolveClient(token);
  if (!client) notFound();
  return client;
}

/** Request metadata for the approvals audit log. */
export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent"),
  };
}

export function portalUrl(token: string, path = ""): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/p/${token}${path}`;
}
