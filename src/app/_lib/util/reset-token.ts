import crypto from "crypto";

// Password-reset tokens live for one hour. Short enough to limit the window if
// the email is intercepted, long enough for a user to act on it.
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// Generate a 256-bit URL-safe token. The raw value goes in the emailed link; we
// never store it — only its hash — so a leaked DB cannot be used to reset
// passwords.
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Hash a token for storage/lookup. SHA-256 (not bcrypt) is appropriate here:
// the token already has full entropy, so there is nothing to brute-force, and
// we need a deterministic value to look the row up by.
export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Absolute base URL for links in outbound email. AUTH_URL is already the
// NextAuth convention; fall back to localhost in dev so links are still valid.
export function getAppBaseUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
