import { randomBytes } from "node:crypto";

/**
 * The portal token IS the credential for a no-login client portal, so it has to
 * be unguessable: 32 random bytes (256 bits) from the CSPRNG, base64url encoded
 * so it survives being pasted into a URL, an email, and a text message.
 */
export function newPortalToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Cheap pre-filter before hitting the database with an attacker-supplied path. */
export function looksLikePortalToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
