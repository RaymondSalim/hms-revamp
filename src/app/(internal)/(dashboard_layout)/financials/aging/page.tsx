import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { getAgingReport } from "@/app/_db/reports";

function formatRupiah(amount: number): string {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export default async function AgingReportPage() {
  const { authorized } = await checkPermission("financials.view");
  if (!authorized) return <AccessDenied />;

  const report = await getAgingReport();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
        Umur Piutang
      </h1>

      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border)",
        }}
      >
        {report.tenants.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Tidak ada piutang yang belum lunas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--color-text-secondary)" }}>
                  <th className="text-left py-2 px-3 font-medium">Penyewa</th>
                  <th className="text-left py-2 px-3 font-medium">Lokasi</th>
                  <th className="text-right py-2 px-3 font-medium">Belum Jatuh Tempo</th>
                  <th className="text-right py-2 px-3 font-medium">1-30 hari</th>
                  <th className="text-right py-2 px-3 font-medium">31-60 hari</th>
                  <th className="text-right py-2 px-3 font-medium">61-90 hari</th>
                  <th className="text-right py-2 px-3 font-medium">&gt;90 hari</th>
                  <th className="text-right py-2 px-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.tenants.map((row) => (
                  <tr
                    key={row.tenant_id ?? row.tenant_name}
                    className="border-t"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <td className="py-2.5 px-3" style={{ color: "var(--color-text-primary)" }}>
                      {row.tenant_name}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: "var(--color-text-secondary)" }}>
                      {row.location_name ?? "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right" style={{ color: "var(--color-text-secondary)" }}>
                      {formatRupiah(row.current)}
                    </td>
                    <td className="py-2.5 px-3 text-right" style={{ color: "var(--color-text-secondary)" }}>
                      {formatRupiah(row.d1_30)}
                    </td>
                    <td className="py-2.5 px-3 text-right" style={{ color: "var(--color-text-secondary)" }}>
                      {formatRupiah(row.d31_60)}
                    </td>
                    <td className="py-2.5 px-3 text-right" style={{ color: "var(--color-text-secondary)" }}>
                      {formatRupiah(row.d61_90)}
                    </td>
                    <td className="py-2.5 px-3 text-right" style={{ color: "var(--color-text-secondary)" }}>
                      {formatRupiah(row.d90_plus)}
                    </td>
                    <td
                      className="py-2.5 px-3 text-right font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {formatRupiah(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className="border-t-2 font-semibold"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  <td className="py-2.5 px-3" colSpan={2}>
                    Total
                  </td>
                  <td className="py-2.5 px-3 text-right">{formatRupiah(report.totals.current)}</td>
                  <td className="py-2.5 px-3 text-right">{formatRupiah(report.totals.d1_30)}</td>
                  <td className="py-2.5 px-3 text-right">{formatRupiah(report.totals.d31_60)}</td>
                  <td className="py-2.5 px-3 text-right">{formatRupiah(report.totals.d61_90)}</td>
                  <td className="py-2.5 px-3 text-right">{formatRupiah(report.totals.d90_plus)}</td>
                  <td className="py-2.5 px-3 text-right">{formatRupiah(report.totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
