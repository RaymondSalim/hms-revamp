import { NextRequest } from "next/server";

/**
 * Verify that the request contains a valid CRON_SECRET bearer token.
 * Returns false if CRON_SECRET is unset/empty (fail closed).
 * Returns true only if Authorization header matches "Bearer <CRON_SECRET>".
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}
