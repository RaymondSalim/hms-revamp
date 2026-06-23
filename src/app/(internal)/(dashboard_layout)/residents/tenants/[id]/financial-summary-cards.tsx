interface FinancialSummaryProps {
  summary: {
    outstanding: number;
    totalPaid: number;
    activeDeposits: number;
    overdueCount: number;
  };
}

function formatCurrency(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
    >
      <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </p>
      <p className="text-xl font-semibold" style={{ color: color || "var(--color-text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

export function FinancialSummaryCards({ summary }: FinancialSummaryProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="Tagihan Belum Lunas"
        value={formatCurrency(summary.outstanding)}
        color={summary.outstanding > 0 ? "#D97706" : undefined}
      />
      <MetricCard
        label="Total Dibayar"
        value={formatCurrency(summary.totalPaid)}
        color="#059669"
      />
      <MetricCard
        label="Deposit Aktif"
        value={formatCurrency(summary.activeDeposits)}
      />
      <MetricCard
        label="Jatuh Tempo"
        value={String(summary.overdueCount)}
        color={summary.overdueCount > 0 ? "#DC2626" : undefined}
      />
    </div>
  );
}
