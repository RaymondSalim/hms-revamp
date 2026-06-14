export const EMAIL_TEMPLATE_KEYS = [
  "BILL_REMINDER",
  "PASSWORD_RESET",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

// The variables each template may reference as {{name}}. Used for: (a) the
// admin UI hint list, (b) building the substitution map at send time.
export const TEMPLATE_VARIABLES: Record<EmailTemplateKey, string[]> = {
  BILL_REMINDER: [
    "tenant_name",
    "room_number",
    "bill_description",
    "outstanding",
    "due_date",
  ],
  PASSWORD_RESET: ["reset_link"],
};

export interface EmailTemplateContent {
  subject: string;
  body_html: string;
}

// Hardcoded fallbacks: identical wording to the pre-refactor mailer.ts so
// behaviour is unchanged when no DB row exists. Also used to seed rows.
export const DEFAULT_TEMPLATES: Record<EmailTemplateKey, EmailTemplateContent> =
  {
    BILL_REMINDER: {
      subject: "Pengingat Tagihan - {{bill_description}}",
      body_html: `
    <p>Yth. {{tenant_name}},</p>
    <p>Ini adalah pengingat untuk tagihan Anda:</p>
    <ul>
      <li>Kamar: {{room_number}}</li>
      <li>Deskripsi: {{bill_description}}</li>
      <li>Total Tagihan: Rp{{outstanding}}</li>
      <li>Jatuh Tempo: {{due_date}}</li>
    </ul>
    <p>Silakan melakukan pembayaran ke:</p>
    <p><strong>BCA 5491118777 a.n. Adriana Nugroho</strong></p>
    <p>Terima kasih.</p>
  `,
    },
    PASSWORD_RESET: {
      subject: "Reset Password - MICASA Suites",
      body_html: `
    <p>Kami menerima permintaan untuk mengatur ulang kata sandi Anda.</p>
    <p>Klik tautan berikut untuk membuat kata sandi baru:</p>
    <p><a href="{{reset_link}}">{{reset_link}}</a></p>
    <p>Tautan ini berlaku selama 1 jam. Jika Anda tidak meminta ini, abaikan email ini.</p>
  `,
    },
  };

export function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value);
}
