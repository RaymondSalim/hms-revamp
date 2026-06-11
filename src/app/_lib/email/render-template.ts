import { prisma } from "@/app/_lib/prisma";
import {
  DEFAULT_TEMPLATES,
  type EmailTemplateContent,
  type EmailTemplateKey,
} from "@/app/_lib/email/template-keys";

/**
 * Replace every {{ name }} token in `text` with vars[name]. Tokens whose name
 * has no entry in `vars` are left untouched. Pure: string in, string out.
 */
export function renderTemplate(
  text: string,
  vars: Record<string, string>
): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(vars, name)
      ? vars[name]
      : match;
  });
}

/**
 * Load the stored template for `key`. Falls back to the hardcoded default when
 * no enabled row exists, so email sending never breaks if a row is missing or
 * has been disabled.
 */
export async function getTemplateOrDefault(
  key: EmailTemplateKey
): Promise<EmailTemplateContent> {
  const row = await prisma.emailTemplate.findUnique({
    where: { template_key: key },
  });
  if (!row || !row.is_enabled) {
    return DEFAULT_TEMPLATES[key];
  }
  return { subject: row.subject, body_html: row.body_html };
}
