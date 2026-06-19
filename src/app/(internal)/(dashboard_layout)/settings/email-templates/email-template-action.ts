"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";
import { logAudit } from "@/app/_lib/audit";
import { isEmailTemplateKey } from "@/app/_lib/email/template-keys";
import { sendTestEmail } from "@/app/_lib/mailer";
import { auth } from "@/app/_lib/auth";
import { generateTestPdf } from "@/app/_lib/util/generate-invoice-pdf";
import { sanitizeTemplateHtml } from "@/app/_lib/util/sanitize-html";

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
  if (
    input.template_key !== "EMAIL_LAYOUT" &&
    input.template_key !== "INVOICE_PDF" &&
    !input.subject.trim()
  ) {
    return { success: false, error: "Subjek harus diisi" };
  }
  if (!input.body_html.trim()) {
    return { success: false, error: "Isi email harus diisi" };
  }

  // Strip any executable content (scripts, event handlers, js: URLs) before
  // persisting. The invoice template is rendered by a headless browser for the
  // PDF, so injected script would run server-side; email bodies render in
  // recipients' clients. {{variable}} placeholders pass through untouched.
  const sanitizedBody = sanitizeTemplateHtml(input.body_html);

  try {
    await prisma.emailTemplate.upsert({
      where: { template_key: input.template_key },
      update: {
        subject: input.subject,
        body_html: sanitizedBody,
        is_enabled: input.is_enabled,
      },
      create: {
        template_key: input.template_key,
        subject: input.subject,
        body_html: sanitizedBody,
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

export async function saveInvoiceFilenameAction(pattern: string) {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  if (!pattern.trim()) {
    return { success: false, error: "Nama file tidak boleh kosong" };
  }

  try {
    await prisma.setting.upsert({
      where: { setting_key: "INVOICE_PDF_FILENAME" },
      update: { setting_value: pattern.trim() },
      create: { setting_key: "INVOICE_PDF_FILENAME", setting_value: pattern.trim() },
    });
    await logAudit(`setting.upsert: INVOICE_PDF_FILENAME`);
    return { success: true };
  } catch (e: unknown) {
    console.error("Save invoice filename error:", e);
    return { success: false, error: "Gagal menyimpan nama file" };
  }
}

export async function sendTestEmailAction(
  templateKey: string,
  bodyHtml: string,
  subject: string
) {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return { success: false, error: "Tidak memiliki akses" };

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { success: false, error: "Email pengguna tidak ditemukan" };

  try {
    await sendTestEmail(email, subject, sanitizeTemplateHtml(bodyHtml), templateKey);
    return { success: true, email };
  } catch (e: unknown) {
    console.error("sendTestEmail error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return { success: false, error: `Gagal mengirim email test: ${message}` };
  }
}

export async function generateTestPdfAction(bodyHtml: string) {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized)
    return { success: false, error: "Tidak memiliki akses" } as const;

  try {
    const pdf = await generateTestPdf(sanitizeTemplateHtml(bodyHtml));
    return { success: true, base64: pdf.toString("base64") } as const;
  } catch (e: unknown) {
    console.error("generateTestPdf error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return { success: false, error: `Gagal generate PDF: ${message}` } as const;
  }
}
