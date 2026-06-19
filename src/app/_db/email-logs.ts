import { prisma } from "@/app/_lib/prisma";

export async function createEmailLog(data: { from: string; to: string; subject?: string; status: string; payload: string }) {
  return prisma.emailLogs.create({ data });
}

export async function getEmailLogs(limit = 50) {
  return prisma.emailLogs.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
