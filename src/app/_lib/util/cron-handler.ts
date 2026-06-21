import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/_lib/util/cron-auth";
import { withRequestId } from "@/app/_lib/util/request-context";
import { logger, captureException } from "@/app/_lib/logger";

/**
 * Wrap a cron job's work function with the shared concerns every cron route
 * repeats: secret verification, a request-id-scoped logging context, and
 * structured start/finish/error logs. The `x-request-id` set by middleware is
 * reused so cron logs correlate with the originating request.
 *
 * Returns a handler usable for both GET and POST.
 */
export function createCronHandler(
  name: string,
  run: () => Promise<unknown>
): (request: NextRequest) => Promise<NextResponse> {
  return (request: NextRequest) => {
    if (!verifyCronSecret(request)) {
      return Promise.resolve(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    const requestId = request.headers.get("x-request-id") ?? undefined;

    return withRequestId(async () => {
      const startedAt = Date.now();
      logger.info(`cron.start: ${name}`);
      try {
        const result = await run();
        logger.info(`cron.done: ${name}`, {
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(result);
      } catch (e) {
        captureException(e, {
          message: `cron.error: ${name}`,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
          { success: false, error: "Cron job failed" },
          { status: 500 }
        );
      }
    }, requestId);
  };
}
