"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";
import { logAudit } from "@/app/_lib/audit";
import { isEmailTemplateKey } from "@/app/_lib/email/template-keys";

export interface EmailTemplateInput {
  template_key: string;
  subject: string;
  body_html: string;
  is_enabled: boolean;
}

export async function upsertEmailTemplateAction(input: EmailTemplateInput) {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  if (!isEmailTemplateKey(input.template_key)) {
    return { success: false, error: "Template tidak dikenal" };
  }
  if (!input.subject.trim()) {
    return { success: false, error: "Subjek harus diisi" };
  }
  if (!input.body_html.trim()) {
    return { success: false, error: "Isi email harus diisi" };
  }

  try {
    await prisma.emailTemplate.upsert({
      where: { template_key: input.template_key },
      update: {
        subject: input.subject,
        body_html: input.body_html,
        is_enabled: input.is_enabled,
      },
      create: {
        template_key: input.template_key,
        subject: input.subject,
        body_html: input.body_html,
        is_enabled: input.is_enabled,
      },
    });

    await logAudit(`email_template.upsert: key=${input.template_key}`);
    revalidatePath("/settings/email-templates");
    return { success: true };
  } catch (e: unknown) {
    console.error("Email template upsert error:", e);
    return { success: false, error: "Gagal menyimpan template email" };
  }
}
