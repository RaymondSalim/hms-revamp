import puppeteer from "puppeteer";
import { computeInvoiceTotals } from "@/app/_lib/util/invoice-totals";
import { formatUtcDate } from "@/app/_lib/util/business-time";
import { prisma } from "@/app/_lib/prisma";
import {
  DEFAULT_INVOICE_PDF_TEMPLATE,
  DEFAULT_INVOICE_FILENAME,
} from "@/app/_lib/email/template-keys";
import { renderTemplate } from "@/app/_lib/email/render-template";

function rupiah(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export interface InvoicePdfInput {
  invoice_number: string | null;
  description: string;
  due_date: Date;
  bill_item: Array<{ description?: string | null; amount: unknown }>;
  paymentBills: Array<{ amount: unknown }>;
  tenant: { name: string } | null;
  room: { room_number: string } | null;
  location: { name: string; address: string | null } | null;
}

async function getInvoiceTemplate(): Promise<string> {
  const row = await prisma.emailTemplate.findUnique({
    where: { template_key: "INVOICE_PDF" },
  });
  return row?.body_html || DEFAULT_INVOICE_PDF_TEMPLATE;
}

async function getInvoiceFilenamePattern(): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { setting_key: "INVOICE_PDF_FILENAME" },
  });
  return row?.setting_value || DEFAULT_INVOICE_FILENAME;
}

async function getCompanyInfo(): Promise<{ name: string; logoUrl: string }> {
  const [nameRow, logoRow] = await Promise.all([
    prisma.setting.findUnique({ where: { setting_key: "COMPANY_NAME" } }),
    prisma.setting.findUnique({ where: { setting_key: "COMPANY_IMAGE" } }),
  ]);
  return {
    name: nameRow?.setting_value || "Perusahaan Anda",
    logoUrl: logoRow?.setting_value || "",
  };
}

function buildItemsTable(
  items: Array<{ description?: string | null; amount: unknown }>
): string {
  if (items.length === 0) {
    return `<table><thead><tr><th>Deskripsi</th><th>Jumlah</th></tr></thead><tbody><tr><td colspan="2" style="text-align:center;color:#94a3b8;">Tidak ada item</td></tr></tbody></table>`;
  }
  const rows = items
    .map(
      (i) =>
        `<tr><td>${i.description ?? "-"}</td><td>${rupiah(Number(i.amount))}</td></tr>`
    )
    .join("\n");
  return `<table><thead><tr><th>Deskripsi</th><th>Jumlah</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function generateInvoicePdf(
  input: InvoicePdfInput
): Promise<Buffer> {
  const { subtotal, tax, total, paid, outstanding } = computeInvoiceTotals(
    input.bill_item.map((i) => ({
      description: i.description ?? "",
      amount: Number(i.amount),
    })),
    input.paymentBills.map((p) => ({ amount: Number(p.amount) }))
  );

  const [template, company] = await Promise.all([
    getInvoiceTemplate(),
    getCompanyInfo(),
  ]);

  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:40px;margin-bottom:4px;">`
    : "";

  const vars: Record<string, string> = {
    invoice_number: input.invoice_number ?? "-",
    tenant_name: input.tenant?.name ?? "-",
    room_number: input.room?.room_number ?? "-",
    location_name: input.location?.name ?? "",
    location_address: input.location?.address ?? "",
    description: input.description,
    due_date: formatUtcDate(input.due_date),
    items_table: buildItemsTable(input.bill_item),
    subtotal: rupiah(subtotal),
    tax: rupiah(tax),
    total: rupiah(total),
    paid: rupiah(paid),
    outstanding: rupiah(outstanding),
    company_name: company.name,
    company_logo_url: logoHtml,
  };

  const html = renderTemplate(template, vars, false);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function getInvoiceFilename(
  input: InvoicePdfInput
): Promise<string> {
  const pattern = await getInvoiceFilenamePattern();
  const vars: Record<string, string> = {
    invoice_number: input.invoice_number ?? String(Date.now()),
    tenant_name: input.tenant?.name ?? "unknown",
    room_number: input.room?.room_number ?? "",
    description: input.description,
    due_date: formatUtcDate(input.due_date),
  };
  const raw = renderTemplate(pattern, vars, false);
  return raw.replace(/[\/\\:*?"<>|]/g, "-");
}

export async function generateTestPdf(templateHtml: string): Promise<Buffer> {
  const company = await getCompanyInfo();
  const logoHtml = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height:40px;margin-bottom:4px;">`
    : "";

  const sampleItems = [
    { description: "Sewa Kamar - Juni 2026", amount: 3500000 },
    { description: "Listrik", amount: 150000 },
  ];

  const vars: Record<string, string> = {
    invoice_number: "INV/2026/06/001",
    tenant_name: "Budi Santoso",
    room_number: "A-201",
    location_name: "MICASA Suites",
    location_address: "Jl. Contoh No. 123, Jakarta",
    description: "Sewa Bulan Juni 2026",
    due_date: "25 Jun 2026",
    items_table: buildItemsTable(sampleItems),
    subtotal: rupiah(3650000),
    tax: rupiah(0),
    total: rupiah(3650000),
    paid: rupiah(500000),
    outstanding: rupiah(3150000),
    company_name: company.name,
    company_logo_url: logoHtml,
  };

  const html = renderTemplate(templateHtml, vars, false);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
