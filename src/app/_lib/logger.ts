import { getRequestId } from "@/app/_lib/util/request-context";

/**
 * Lightweight structured logger. Dependency-free and deployment-agnostic
 * (works on serverless and long-running servers): in production it emits one
 * JSON object per line to stdout/stderr — ready to be scraped by Vercel,
 * CloudWatch, Loki, etc. In development it prints a readable single line.
 *
 * Error tracking (Sentry/Bugsnag/...) is intentionally decoupled: register a
 * sink via `setErrorTracker()` and `captureException()` will forward to it.
 * Until then, exceptions are still logged. This lets us wire a provider later
 * (once deployment is chosen) without touching call sites.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

const isProd = process.env.NODE_ENV === "production";

type ErrorTracker = (error: unknown, context?: LogMeta) => void;

let errorTracker: ErrorTracker | null = null;

/** Register an error-tracking sink (e.g. Sentry). Call once at startup. */
export function setErrorTracker(tracker: ErrorTracker): void {
  errorTracker = tracker;
}

function emit(level: LogLevel, message: string, meta?: LogMeta): void {
  const requestId = getRequestId();
  const record: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    message,
    ...(requestId ? { requestId } : {}),
    ...(meta ?? {}),
  };

  const line = isProd ? JSON.stringify(record) : formatDev(level, record);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function formatDev(level: LogLevel, record: Record<string, unknown>): string {
  const { time, message, ...rest } = record;
  delete (rest as LogMeta).level;
  const extras = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
  return `[${String(time).slice(11, 19)}] ${level.toUpperCase()} ${message}${extras}`;
}

function serializeError(error: unknown): LogMeta {
  if (error instanceof Error) {
    return {
      error: { name: error.name, message: error.message, stack: error.stack },
    };
  }
  return { error: String(error) };
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => {
    if (!isProd) emit("debug", message, meta);
  },
  info: (message: string, meta?: LogMeta) => emit("info", message, meta),
  warn: (message: string, meta?: LogMeta) => emit("warn", message, meta),
  error: (message: string, meta?: LogMeta) => emit("error", message, meta),
};

/**
 * Log an exception at error level and forward it to the registered error
 * tracker (if any). Use this in catch blocks instead of `console.error`.
 */
export function captureException(
  error: unknown,
  context?: LogMeta
): void {
  emit("error", context?.message ? String(context.message) : "Unhandled exception", {
    ...context,
    ...serializeError(error),
  });
  try {
    errorTracker?.(error, context);
  } catch {
    // Never let the tracker itself break the request.
  }
}
