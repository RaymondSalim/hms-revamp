import { prisma } from "@/app/_lib/prisma";
import {
  DEFAULT_TEMPLATES,
  type EmailTemplateContent,
  type EmailTemplateKey,
} from "@/app/_lib/email/template-keys";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Replace every {{ name }} token in `text` with vars[name]. Tokens whose name
 * has no entry in `vars` are left untouched. Pure: string in, string out.
 *
 * Pass `escapeValues: true` when rendering into an HTML body so that
 * attacker-controlled values (tenant names, bill descriptions) cannot inject
 * markup/script. Leave it false for plain-text contexts like the subject line,
 * where HTML-escaping would corrupt characters such as `&`.
 */
export function renderTemplate(
  text: string,
  vars: Record<string, string>,
  escapeValues = false
): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) {
      return match;
    }
    return escapeValues ? escapeHtml(vars[name]) : vars[name];
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

/**
 * Render an email body wrapped in the shared layout template.
 * Resolves layout from DB (EMAIL_LAYOUT key) or falls back to built-in default.
 * Injects company_name, company_logo_url, and the rendered content body.
 */
export async function renderEmailWithLayout(
  bodyHtml: string,
  vars: Record<string, string>
): Promise<string> {
  const layout = await getTemplateOrDefault("EMAIL_LAYOUT");

  const companyName = await getCompanyNameForEmail();
  const companyLogoUrl = await getCompanyLogoForEmail();

  const renderedBody = renderTemplate(bodyHtml, vars, true);

  const logoHtml = companyLogoUrl
    ? `<img src="${escapeHtml(companyLogoUrl)}" alt="${escapeHtml(companyName)}" style="max-height:48px;margin-bottom:8px;">`
    : "";

  const layoutVars: Record<string, string> = {
    content: renderedBody,
    company_name: companyName,
    company_logo_url: logoHtml,
  };

  return renderTemplate(layout.body_html, layoutVars, false);
}

async function getCompanyNameForEmail(): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { setting_key: "COMPANY_NAME" },
  });
  return row?.setting_value || "Perusahaan Anda";
}

async function getCompanyLogoForEmail(): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { setting_key: "COMPANY_IMAGE" },
  });
  return row?.setting_value || "";
}
