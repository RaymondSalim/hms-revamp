import { prisma } from "@/app/_lib/prisma";
import { auth } from "@/app/_lib/auth";

export async function logAudit(action: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return;

    await prisma.log.create({
      data: {
        action,
        site_user_id: session.user.id,
      },
    });
  } catch {
    // Audit logging should never break the main flow
  }
}
