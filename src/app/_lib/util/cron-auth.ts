import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Verify that the request contains a valid CRON_SECRET bearer token.
 * Returns false if CRON_SECRET is unset/empty (fail closed).
 * Returns true only if Authorization header matches "Bearer <CRON_SECRET>".
 *
 * The comparison is constant-time so an attacker cannot recover the secret by
 * measuring how long a near-miss takes to reject.
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual = Buffer.from(authHeader);
  // timingSafeEqual throws on length mismatch, which itself leaks length; guard
  // first so both branches are cheap and constant-time relative to each other.
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}
