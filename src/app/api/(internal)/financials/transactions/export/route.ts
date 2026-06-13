import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import ExcelJS from "exceljs";
import { format } from "date-fns";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(request: NextRequest) {
  const { authorized } = await checkPermission("financials.export");
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const exportFormat = searchParams.get("format"); // "xlsx" or "pdf"
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const locationId = Number(searchParams.get("locationId"));

  if (!locationId)
    return NextResponse.json(
      { error: "locationId required" },
      { status: 400 }
    );

  const whereClause: Record<string, unknown> = { location_id: locationId };
  if (startDate && endDate) {
    whereClause.date = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  const transactions = await prisma.transaction.findMany({
    where: whereClause,
    orderBy: { date: "asc" },
  });

  // BL-030: Filename format
  const startStr = startDate ? startDate.replace(/-/g, "") : "semua-waktu";
  const endStr = endDate ? endDate.replace(/-/g, "") : "semua-waktu";
  const filename = `transaksi-keuangan_${startStr}_${endStr}`;

  if (exportFormat === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Transaksi");

    sheet.columns = [
      { header: "Tanggal", key: "date", width: 15 },
      { header: "Deskripsi", key: "description", width: 30 },
      { header: "Kategori", key: "category", width: 20 },
      { header: "Tipe", key: "type", width: 10 },
      { header: "Jumlah", key: "amount", width: 20 },
    ];

    // Header styling
    sheet.getRow(1).font = { bold: true };

    for (const txn of transactions) {
      sheet.addRow({
        date: format(txn.date, "dd/MM/yyyy"),
        description: txn.description,
        category: txn.category || "-",
        type: txn.type,
        amount: Number(txn.amount),
      });
    }

    // Add totals
    const totalIncome = transactions
      .filter((t) => t.type === "INCOME")
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalExpense = transactions
      .filter((t) => t.type === "EXPENSE")
      .reduce((s, t) => s + Number(t.amount), 0);

    sheet.addRow({});
    sheet.addRow({
      date: "",
      description: "Total Pemasukan",
      category: "",
      type: "INCOME",
      amount: totalIncome,
    });
    sheet.addRow({
      date: "",
      description: "Total Pengeluaran",
      category: "",
      type: "EXPENSE",
      amount: totalExpense,
    });
    sheet.addRow({
      date: "",
      description: "Selisih",
      category: "",
      type: "",
      amount: totalIncome - totalExpense,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  // PDF fallback: generate a simple HTML table and return as downloadable HTML
  const totalIncome = transactions
    .filter((t) => t.type === "INCOME")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((s, t) => s + Number(t.amount), 0);

  const html = `<!DOCTYPE html><html><head><title>Transaksi Keuangan</title>
    <style>body{font-family:sans-serif;margin:40px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.income{color:green}.expense{color:red}</style></head>
    <body><h1>Laporan Transaksi Keuangan</h1>
    <p>Periode: ${escapeHtml(startDate || "Semua waktu")} s/d ${escapeHtml(endDate || "Semua waktu")}</p>
    <table><tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Tipe</th><th>Jumlah</th></tr>
    ${transactions
      .map(
        (t) =>
          `<tr><td>${format(t.date, "dd/MM/yyyy")}</td><td>${escapeHtml(t.description)}</td><td>${escapeHtml(t.category || "-")}</td><td class="${escapeHtml(t.type.toLowerCase())}">${escapeHtml(t.type)}</td><td>Rp${Number(t.amount).toLocaleString("id-ID")}</td></tr>`
      )
      .join("")}
    <tr><td colspan="4"><strong>Total Pemasukan</strong></td><td><strong>Rp${totalIncome.toLocaleString("id-ID")}</strong></td></tr>
    <tr><td colspan="4"><strong>Total Pengeluaran</strong></td><td><strong>Rp${totalExpense.toLocaleString("id-ID")}</strong></td></tr>
    <tr><td colspan="4"><strong>Selisih</strong></td><td><strong>Rp${(totalIncome - totalExpense).toLocaleString("id-ID")}</strong></td></tr>
    </table></body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html",
      "Content-Disposition": `attachment; filename="${filename}.html"`,
    },
  });
}
