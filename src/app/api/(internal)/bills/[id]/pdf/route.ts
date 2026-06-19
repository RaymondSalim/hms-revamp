import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import {
  getScopedLocationIds,
  isLocationInScope,
} from "@/app/_lib/util/location-scope";
import {
  generateInvoicePdf,
  getInvoiceFilename,
} from "@/app/_lib/util/generate-invoice-pdf";

export const runtime = "nodejs";

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

  const bill = await prisma.bill.findFirst({
    where: { id: billId, deletedAt: null },
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

  const billLocationId = bill.bookings?.rooms?.location_id ?? null;
  const scope = await getScopedLocationIds();
  if (billLocationId == null || !isLocationInScope(scope, billLocationId)) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }

  const pdfInput = {
    invoice_number: bill.invoice_number,
    description: bill.description,
    due_date: bill.due_date,
    bill_item: bill.bill_item,
    paymentBills: bill.paymentBills,
    tenant: bill.bookings?.tenants ?? null,
    room: bill.bookings?.rooms ?? null,
    location: bill.bookings?.rooms?.locations ?? null,
  };

  const [pdf, filename] = await Promise.all([
    generateInvoicePdf(pdfInput),
    getInvoiceFilename(pdfInput),
  ]);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}
