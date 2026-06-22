import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import {
  type Paginated,
  type TableParams,
  buildPaginated,
  toSkipTake,
} from "@/app/_lib/util/table-params";

export async function createEmailLog(data: { from: string; to: string; subject?: string; status: string; payload: string }) {
  return prisma.emailLogs.create({ data });
}

export type EmailLogRow = Prisma.EmailLogsGetPayload<true>;

/** Columns the email-logs table may be sorted by. */
export const EMAIL_LOG_SORT_KEYS = ["createdAt", "to", "subject", "status"] as const;

/**
 * Recognized log statuses. Writers use SUCCESS for delivered mail and
 * FAIL_SERVER / FAIL_CLIENT for failures (see mailer.ts). The table groups the
 * two failure kinds under a single "FAIL" filter for the user.
 */
export type EmailLogStatusFilter = "SUCCESS" | "FAIL";

function statusWhere(filter: EmailLogStatusFilter | null): Prisma.EmailLogsWhereInput {
  if (filter === "SUCCESS") return { status: "SUCCESS" };
  // Anything that isn't a clean success is a failure of some kind.
  if (filter === "FAIL") return { status: { not: "SUCCESS" } };
  return {};
}

/**
 * Paginated, searchable, status-filtered email log listing. Search matches the
 * recipient or subject. Email logs are not location-scoped (mail is global).
 */
export async function getEmailLogsPage(
  params: TableParams,
  statusFilter: EmailLogStatusFilter | null
): Promise<Paginated<EmailLogRow>> {
  const search = params.search;

  const where: Prisma.EmailLogsWhereInput = {
    ...statusWhere(statusFilter),
    ...(search
      ? {
          OR: [
            { to: { contains: search, mode: "insensitive" } },
            { subject: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const sortKey = (params.sortBy ?? "createdAt") as (typeof EMAIL_LOG_SORT_KEYS)[number];
  const orderBy: Prisma.EmailLogsOrderByWithRelationInput = { [sortKey]: params.sortDir };

  const { skip, take } = toSkipTake(params);

  const [rows, total] = await Promise.all([
    prisma.emailLogs.findMany({ where, orderBy, skip, take }),
    prisma.emailLogs.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}

/** Fetch a single log row by id (used by the resend action). */
export async function getEmailLogById(id: number): Promise<EmailLogRow | null> {
  return prisma.emailLogs.findUnique({ where: { id } });
}
