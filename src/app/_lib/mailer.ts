import nodemailer from "nodemailer";
import { prisma } from "@/app/_lib/prisma";
import {
  getTemplateOrDefault,
  renderTemplate,
  renderEmailWithLayout,
} from "@/app/_lib/email/render-template";
import {
  generateInvoicePdf,
  getInvoiceFilename,
} from "@/app/_lib/util/generate-invoice-pdf";

const transporter =
  process.env.NODE_ENV === "production"
    ? nodemailer.createTransport({
        host:
          process.env.SMTP_HOST ||
          "email-smtp.ap-southeast-1.amazonaws.com",
        port: parseInt(process.env.SMTP_PORT || "465", 10),
        secure: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST || "localhost",
        port: parseInt(process.env.SMTP_PORT || "1025", 10),
        secure: false,
      });

const DEFAULT_FROM = '"MICASA Suites" <noreply@micasasuites.com>';

async function getCompanyName(): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { setting_key: "COMPANY_NAME" },
  });
  return row?.setting_value || "Perusahaan Anda";
}

export async function sendBillReminderEmail(bill: any) {
  const tenant = bill.bookings.tenants;
  const room = bill.bookings.rooms;
  const location = room?.locations ?? null;
  const total = bill.bill_item.reduce(
    (s: number, i: any) => s + Number(i.amount),
    0,
  );
  const paid = bill.paymentBills.reduce(
    (s: number, p: any) => s + Number(p.amount),
    0,
  );
  const outstanding = total - paid;

  const template = await getTemplateOrDefault("BILL_REMINDER");
  const vars: Record<string, string> = {
    tenant_name: tenant.name,
    room_number: String(room.room_number),
    bill_description: bill.description,
    outstanding: outstanding.toLocaleString("id-ID"),
    due_date: bill.due_date.toLocaleDateString("id-ID"),
  };
  const subject = renderTemplate(template.subject, vars);
  const html = await renderEmailWithLayout(template.body_html, vars);

  const pdfInput = {
    invoice_number: bill.invoice_number ?? null,
    description: bill.description,
    due_date: bill.due_date,
    bill_item: bill.bill_item.map((i: any) => ({
      description: i.description,
      amount: i.amount,
    })),
    paymentBills: bill.paymentBills.map((p: any) => ({ amount: p.amount })),
    tenant,
    room,
    location,
  };

  const [pdf, invoiceFilename] = await Promise.all([
    generateInvoicePdf(pdfInput),
    getInvoiceFilename(pdfInput),
  ]);

  try {
    await transporter.sendMail({
      from: DEFAULT_FROM,
      to: tenant.email,
      subject,
      html,
      attachments: [
        {
          filename: `${invoiceFilename}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
    await prisma.emailLogs.create({
      data: {
        from: DEFAULT_FROM,
        to: tenant.email,
        subject,
        status: "SUCCESS",
        payload: html,
      },
    });
  } catch (e: any) {
    const status = e.responseCode ? "FAIL_SERVER" : "FAIL_CLIENT";
    await prisma.emailLogs.create({
      data: {
        from: DEFAULT_FROM,
        to: tenant.email,
        subject,
        status,
        payload: e.message,
      },
    });
    throw e;
  }
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  const template = await getTemplateOrDefault("PASSWORD_RESET");
  const companyName = await getCompanyName();
  const vars: Record<string, string> = { reset_link: resetLink, company_name: companyName };
  const subject = renderTemplate(template.subject, vars);
  const html = await renderEmailWithLayout(template.body_html, vars);

  try {
    await transporter.sendMail({
      from: DEFAULT_FROM,
      to: email,
      subject,
      html,
    });
    await prisma.emailLogs.create({
      data: {
        from: DEFAULT_FROM,
        to: email,
        subject,
        status: "SUCCESS",
        payload: html,
      },
    });
  } catch (e: any) {
    const status = e.responseCode ? "FAIL_SERVER" : "FAIL_CLIENT";
    await prisma.emailLogs.create({
      data: {
        from: DEFAULT_FROM,
        to: email,
        subject,
        status,
        payload: e.message,
      },
    });
  }
}

const TEST_VARS: Record<string, string> = {
  tenant_name: "Budi Santoso",
  room_number: "A-201",
  bill_description: "Sewa Bulan Juni 2026",
  outstanding: "3.500.000",
  due_date: "25 Jun 2026",
  reset_link: "https://app.example.com/reset?token=test123",
};

export async function sendTestEmail(
  to: string,
  subjectTemplate: string,
  bodyHtml: string,
  templateKey: string
) {
  const companyName = await getCompanyName();
  const vars = { ...TEST_VARS, company_name: companyName };

  const subject =
    templateKey === "EMAIL_LAYOUT"
      ? `[TEST] Layout Email - ${companyName}`
      : `[TEST] ${renderTemplate(subjectTemplate, vars)}`;

  const html =
    templateKey === "EMAIL_LAYOUT"
      ? await renderLayoutOnly(bodyHtml, vars)
      : await renderEmailWithLayout(bodyHtml, vars);

  const attachments =
    templateKey === "BILL_REMINDER" || templateKey === "EMAIL_LAYOUT"
      ? [
          {
            filename: "invoice-SAMPLE.pdf",
            content: await generateSamplePdf(vars),
            contentType: "application/pdf",
          },
        ]
      : [];

  await transporter.sendMail({ from: DEFAULT_FROM, to, subject, html, attachments });
  await prisma.emailLogs.create({
    data: { from: DEFAULT_FROM, to, subject, status: "SUCCESS", payload: html },
  });
}

async function generateSamplePdf(vars: Record<string, string>): Promise<Buffer> {
  return generateInvoicePdf({
    invoice_number: "INV/2026/06/001",
    description: vars.bill_description,
    due_date: new Date("2026-06-25"),
    bill_item: [
      { description: "Sewa Kamar - Juni 2026", amount: 3500000 },
      { description: "Listrik", amount: 150000 },
    ],
    paymentBills: [{ amount: 500000 }],
    tenant: { name: vars.tenant_name },
    room: { room_number: vars.room_number },
    location: { name: "MICASA Suites", address: "Jl. Contoh No. 123, Jakarta" },
  });
}

async function renderLayoutOnly(
  layoutHtml: string,
  vars: Record<string, string>
): Promise<string> {
  const sampleContent = `<p>Yth. <strong>${vars.tenant_name}</strong>,</p>
<p>Ini adalah email test untuk memverifikasi layout template Anda.</p>
<table>
  <tr><th>Detail</th><th>Keterangan</th></tr>
  <tr><td>Kamar</td><td><strong>${vars.room_number}</strong></td></tr>
  <tr><td>Deskripsi</td><td>${vars.bill_description}</td></tr>
</table>
<div class="highlight">
  <p style="margin:0 0 4px; color:#64748b; font-size:13px;">Total yang harus dibayar</p>
  <p class="amount" style="margin:0;">Rp${vars.outstanding}</p>
</div>
<p>Terima kasih.</p>`;

  const companyLogoUrl = await getCompanyLogoUrl();
  const logoHtml = companyLogoUrl
    ? `<img src="${companyLogoUrl}" alt="${vars.company_name}" style="max-height:48px;margin-bottom:8px;">`
    : "";

  const layoutVars: Record<string, string> = {
    content: sampleContent,
    company_name: vars.company_name,
    company_logo_url: logoHtml,
  };

  return renderTemplate(layoutHtml, layoutVars, false);
}

async function getCompanyLogoUrl(): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { setting_key: "COMPANY_IMAGE" },
  });
  return row?.setting_value || "";
}
