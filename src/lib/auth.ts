/**
 * Admin authentication.
 *
 * A single shared password plus a signed HttpOnly session cookie, rather than
 * Supabase Auth magic links. For a one-to-two person agency this is fewer
 * moving parts, needs no email provider, and works offline — and the admin
 * surface is only ever used by Strive staff. Client-side access is a different
 * mechanism entirely (secret portal tokens, see ./portal).
 */
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { createHash, timingSafeEqual } from "node:crypto";

const COOKIE = "strive_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const isProd = process.env.NODE_ENV === "production";

function requiredSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (isProd) {
    throw new Error(
      `${name} must be set in production. Generate one with: openssl rand -base64 32`,
    );
  }
  return devFallback;
}

function sessionKey(): Uint8Array {
  return new TextEncoder().encode(
    requiredSecret("SESSION_SECRET", "dev-only-insecure-session-secret-change-me"),
  );
}

function adminPassword(): string {
  return requiredSecret("ADMIN_PASSWORD", "strive");
}

/** Constant-time compare so the password can't be recovered by timing. */
export function verifyAdminPassword(attempt: string): boolean {
  const a = createHash("sha256").update(attempt, "utf8").digest();
  const b = createHash("sha256").update(adminPassword(), "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function createSession(): Promise<void> {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(sessionKey());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

/** Use at the top of every admin page and action. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/login");
}
