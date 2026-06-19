export const EMAIL_TEMPLATE_KEYS = [
  "EMAIL_LAYOUT",
  "BILL_REMINDER",
  "PASSWORD_RESET",
  "INVOICE_PDF",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const TEMPLATE_VARIABLES: Record<EmailTemplateKey, string[]> = {
  EMAIL_LAYOUT: ["content", "company_name", "company_logo_url"],
  BILL_REMINDER: [
    "tenant_name",
    "room_number",
    "bill_description",
    "outstanding",
    "due_date",
  ],
  PASSWORD_RESET: ["reset_link", "company_name"],
  INVOICE_PDF: [
    "invoice_number",
    "tenant_name",
    "room_number",
    "location_name",
    "location_address",
    "description",
    "due_date",
    "items_table",
    "subtotal",
    "tax",
    "total",
    "paid",
    "outstanding",
    "company_name",
    "company_logo_url",
  ],
};

export interface EmailTemplateContent {
  subject: string;
  body_html: string;
}

export const DEFAULT_EMAIL_LAYOUT = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-wrapper { width: 100%; background-color: #f4f4f7; padding: 40px 0; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .email-header { background-color: #1e293b; padding: 32px 40px; text-align: center; }
    .email-header img { max-height: 48px; margin-bottom: 8px; }
    .email-header h1 { color: #ffffff; font-size: 20px; font-weight: 600; margin: 0; }
    .email-body { padding: 40px; color: #334155; font-size: 15px; line-height: 1.7; }
    .email-body p { margin: 0 0 16px; }
    .email-body table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .email-body table th { text-align: left; padding: 10px 12px; background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .email-body table td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .email-body .highlight { background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 0 6px 6px 0; margin: 20px 0; }
    .email-body .amount { font-size: 24px; font-weight: 700; color: #1e293b; }
    .email-body a { color: #3b82f6; text-decoration: none; }
    .email-body .btn { display: inline-block; background-color: #3b82f6; color: #ffffff !important; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; text-decoration: none; margin: 16px 0; }
    .email-footer { background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; }
    .email-footer p { color: #94a3b8; font-size: 12px; margin: 0 0 4px; }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
        {{company_logo_url}}
        <h1>{{company_name}}</h1>
      </div>
      <div class="email-body">
        {{content}}
      </div>
      <div class="email-footer">
        <p>&copy; {{company_name}}</p>
        <p>Email ini dikirim secara otomatis. Mohon tidak membalas email ini.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

export const DEFAULT_INVOICE_FILENAME = "invoice-{{invoice_number}}";

export const DEFAULT_INVOICE_PDF_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; font-size: 13px; line-height: 1.5; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #1e293b; padding-bottom: 20px; }
    .header-left h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 4px; }
    .header-left p { color: #64748b; font-size: 12px; }
    .header-right { text-align: right; }
    .header-right .company { font-size: 16px; font-weight: 600; }
    .header-right .address { color: #64748b; font-size: 11px; margin-top: 4px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .info-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 6px; }
    .info-box p { font-size: 13px; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background-color: #f1f5f9; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    thead th:last-child { text-align: right; }
    tbody td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    tbody td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { margin-left: auto; width: 280px; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .totals .row.border-top { border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 10px; }
    .totals .row.grand { font-size: 16px; font-weight: 700; border-top: 2px solid #1e293b; margin-top: 8px; padding-top: 12px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>INVOICE</h1>
      <p>No. {{invoice_number}}</p>
    </div>
    <div class="header-right">
      {{company_logo_url}}
      <div class="company">{{company_name}}</div>
      <div class="address">{{location_name}}<br>{{location_address}}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <h3>Ditagihkan Kepada</h3>
      <p><strong>{{tenant_name}}</strong></p>
      <p>Kamar {{room_number}}</p>
    </div>
    <div class="info-box">
      <h3>Detail Invoice</h3>
      <p>Deskripsi: {{description}}</p>
      <p>Jatuh Tempo: {{due_date}}</p>
    </div>
  </div>

  {{items_table}}

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>{{subtotal}}</span></div>
    <div class="row"><span>PPN</span><span>{{tax}}</span></div>
    <div class="row border-top"><span>Total</span><span>{{total}}</span></div>
    <div class="row"><span>Dibayar</span><span>{{paid}}</span></div>
    <div class="row grand"><span>Sisa Tagihan</span><span>{{outstanding}}</span></div>
  </div>

  <div class="footer">
    <p>Dokumen ini digenerate secara otomatis oleh {{company_name}}</p>
  </div>
</body>
</html>`;

export const DEFAULT_TEMPLATES: Record<EmailTemplateKey, EmailTemplateContent> =
  {
    EMAIL_LAYOUT: {
      subject: "",
      body_html: DEFAULT_EMAIL_LAYOUT,
    },
    BILL_REMINDER: {
      subject: "Pengingat Tagihan - {{bill_description}}",
      body_html: `<p>Yth. <strong>{{tenant_name}}</strong>,</p>

<p>Berikut adalah pengingat tagihan Anda yang akan jatuh tempo:</p>

<table>
  <tr>
    <th>Detail</th>
    <th>Keterangan</th>
  </tr>
  <tr>
    <td>Kamar</td>
    <td><strong>{{room_number}}</strong></td>
  </tr>
  <tr>
    <td>Deskripsi</td>
    <td>{{bill_description}}</td>
  </tr>
  <tr>
    <td>Jatuh Tempo</td>
    <td>{{due_date}}</td>
  </tr>
</table>

<div class="highlight">
  <p style="margin:0 0 4px; color:#64748b; font-size:13px;">Total yang harus dibayar</p>
  <p class="amount" style="margin:0;">Rp{{outstanding}}</p>
</div>

<p>Silakan melakukan pembayaran sebelum tanggal jatuh tempo ke rekening berikut:</p>
<p><strong>BCA 5491118777 a.n. Adriana Nugroho</strong></p>

<p>Terima kasih atas kerjasamanya.</p>`,
    },
    PASSWORD_RESET: {
      subject: "Reset Password - {{company_name}}",
      body_html: `<p>Kami menerima permintaan untuk mengatur ulang kata sandi Anda.</p>

<p>Klik tombol di bawah untuk membuat kata sandi baru:</p>

<p style="text-align:center;">
  <a href="{{reset_link}}" class="btn">Reset Password</a>
</p>

<p style="font-size:13px; color:#64748b;">Atau salin tautan berikut ke browser Anda:<br>
<a href="{{reset_link}}">{{reset_link}}</a></p>

<p style="font-size:13px; color:#64748b;">Tautan ini berlaku selama 1 jam. Jika Anda tidak meminta ini, abaikan email ini.</p>`,
    },
    INVOICE_PDF: {
      subject: "",
      body_html: DEFAULT_INVOICE_PDF_TEMPLATE,
    },
  };

export function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value);
}
