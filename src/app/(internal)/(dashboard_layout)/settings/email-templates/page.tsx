import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  EMAIL_TEMPLATE_KEYS,
  DEFAULT_TEMPLATES,
  TEMPLATE_VARIABLES,
  type EmailTemplateKey,
} from "@/app/_lib/email/template-keys";
import {
  EmailTemplateManager,
  type TemplateRow,
} from "./email-template-manager";

const TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  BILL_REMINDER: "Pengingat Tagihan",
  PASSWORD_RESET: "Reset Password",
};

export default async function EmailTemplatesPage() {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return <AccessDenied />;

  const rows = await prisma.emailTemplate.findMany();

  const templates: TemplateRow[] = EMAIL_TEMPLATE_KEYS.map((key) => {
    const stored = rows.find((r) => r.template_key === key);
    const fallback = DEFAULT_TEMPLATES[key];
    return {
      template_key: key,
      label: TEMPLATE_LABELS[key],
      variables: TEMPLATE_VARIABLES[key],
      subject: stored?.subject ?? fallback.subject,
      body_html: stored?.body_html ?? fallback.body_html,
      is_enabled: stored?.is_enabled ?? true,
    };
  });

  return <EmailTemplateManager templates={templates} />;
}
