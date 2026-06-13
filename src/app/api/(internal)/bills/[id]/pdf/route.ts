import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import { computeInvoiceTotals } from "@/app/_lib/util/invoice-totals";
import PDFDocument from "pdfkit";
import { format } from "date-fns";

// pdfkit relies on Node APIs and reads bundled .afm font metrics at runtime.
export const runtime = "nodejs";

function rupiah(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authorized } = await checkPermission("bills.view");
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const billId = Number(id);
  if (Number.isNaN(billId))
    return NextResponse.json({ error: "Invalid bill id" }, { status: 400 });

  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      bill_item: true,
      paymentBills: true,
      bookings: {
        include: {
          tenants: true,
          rooms: { include: { locations: true } },
        },
      },
    },
  });

  if (!bill)
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const { subtotal, tax, total, paid, outstanding } = computeInvoiceTotals(
    bill.bill_item.map((i) => ({
      description: i.description,
      amount: Number(i.amount),
    })),
    bill.paymentBills.map((p) => ({ amount: Number(p.amount) }))
  );

  const tenant = bill.bookings?.tenants ?? null;
  const room = bill.bookings?.rooms ?? null;
  const location = room?.locations ?? null;

  // --- Build the PDF ---
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );

  // Header
  doc.fontSize(22).font("Helvetica-Bold").text("INVOICE / TAGIHAN");
  doc.moveDown(0.3);
  doc
    .fontSize(11)
    .font("Helvetica")
    .text(`No. Invoice: ${bill.invoice_number ?? "-"}`);
  doc.moveDown(0.8);

  // Location info
  if (location) {
    doc.font("Helvetica-Bold").fontSize(12).text(location.name);
    if (location.address) {
      doc.font("Helvetica").fontSize(10).text(location.address);
    }
    doc.moveDown(0.6);
  }

  // Tenant + room info
  doc.font("Helvetica").fontSize(10);
  doc.text(`Penyewa: ${tenant?.name ?? "-"}`);
  doc.text(`Kamar: ${room?.room_number ?? "-"}`);
  doc.text(`Deskripsi: ${bill.description}`);
  doc.text(`Jatuh Tempo: ${format(bill.due_date, "dd MMM yyyy")}`);
  doc.moveDown(0.8);

  // Divider
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.5);

  // Line items
  doc.font("Helvetica-Bold").fontSize(10);
  const startY = doc.y;
  doc.text("Deskripsi", doc.page.margins.left, startY);
  doc.text("Jumlah", doc.page.margins.left, startY, { align: "right" });
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10);

  for (const item of bill.bill_item) {
    const y = doc.y;
    doc.text(item.description, doc.page.margins.left, y, { width: 350 });
    doc.text(rupiah(Number(item.amount)), doc.page.margins.left, y, {
      align: "right",
    });
    doc.moveDown(0.3);
  }

  if (bill.bill_item.length === 0) {
    doc.text("Tidak ada item", { align: "center" });
    doc.moveDown(0.3);
  }

  doc.moveDown(0.3);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.5);

  // Totals (right-aligned label/value rows)
  const writeTotal = (label: string, value: number, bold = false) => {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10);
    doc.text(label, doc.page.margins.left, y, { align: "left" });
    doc.text(rupiah(value), doc.page.margins.left, y, { align: "right" });
    doc.moveDown(0.4);
  };

  writeTotal("Subtotal", subtotal);
  if (tax > 0) writeTotal("PPN", tax);
  writeTotal("Total", total, true);
  writeTotal("Dibayar", paid);
  writeTotal("Sisa Tagihan", outstanding, true);

  doc.end();
  const pdf = await done;

  const rawName = bill.invoice_number ?? String(bill.id);
  const safeName = rawName.replace(/\//g, "-");

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${safeName}.pdf"`,
    },
  });
}
