"use client";

import { useState, useTransition } from "react";
import { upsertBillingPolicyAction } from "./billing-policy-action";

export interface PolicyScope {
  location_id: number | null;
  late_fee_type: string | null;
  late_fee_amount: number | null;
  grace_period_days: number | null;
  billing_cycle_day: number | null;
  proration_method: string | null;
  rate_escalation_percentage: number | null;
  rate_escalation_frequency: number | null;
  tax_rate: number | null;
  reminder_days_before: number | null;
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none";
const inputStyle = {
  backgroundColor: "var(--color-bg-primary)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
};

function numberOrNull(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function PolicyForm({ label, scope }: { label: string; scope: PolicyScope }) {
  const [form, setForm] = useState<PolicyScope>(scope);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update<K extends keyof PolicyScope>(key: K, value: PolicyScope[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await upsertBillingPolicyAction(form);
      if (result.success) setSaved(true);
    });
  }

  return (
    <div
      className="rounded-lg border p-6 space-y-4"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between">
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {label}
        </h2>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-green-600 font-medium">
              Tersimpan
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>
            Metode Proporsi
          </span>
          <select
            className={inputClass}
            style={inputStyle}
            value={form.proration_method ?? ""}
            onChange={(e) =>
              update("proration_method", e.target.value || null)
            }
          >
            <option value="">(Default: harian)</option>
            <option value="daily">Harian (daily)</option>
            <option value="none">Tidak proporsional (none)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>
            Hari Tenggang (grace period)
          </span>
          <input
            type="number"
            className={inputClass}
            style={inputStyle}
            value={form.grace_period_days ?? ""}
            onChange={(e) =>
              update("grace_period_days", numberOrNull(e.target.value))
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>
            Hari Siklus Tagihan (0 = relatif mulai booking)
          </span>
          <input
            type="number"
            className={inputClass}
            style={inputStyle}
            value={form.billing_cycle_day ?? ""}
            onChange={(e) =>
              update("billing_cycle_day", numberOrNull(e.target.value))
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>
            Tipe Denda Telat
          </span>
          <select
            className={inputClass}
            style={inputStyle}
            value={form.late_fee_type ?? ""}
            onChange={(e) => update("late_fee_type", e.target.value || null)}
          >
            <option value="">(Tidak ada)</option>
            <option value="flat">Nominal (flat)</option>
            <option value="percentage">Persentase (percentage)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>
            Jumlah Denda Telat
          </span>
          <input
            type="number"
            className={inputClass}
            style={inputStyle}
            value={form.late_fee_amount ?? ""}
            onChange={(e) =>
              update("late_fee_amount", numberOrNull(e.target.value))
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>
            Tarif Pajak (%) (mis. 11 untuk PPN)
          </span>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            style={inputStyle}
            value={form.tax_rate ?? ""}
            onChange={(e) => update("tax_rate", numberOrNull(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>
            Kenaikan Tarif (%)
          </span>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            style={inputStyle}
            value={form.rate_escalation_percentage ?? ""}
            onChange={(e) =>
              update(
                "rate_escalation_percentage",
                numberOrNull(e.target.value)
              )
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>
            Frekuensi Kenaikan (bulan)
          </span>
          <input
            type="number"
            className={inputClass}
            style={inputStyle}
            value={form.rate_escalation_frequency ?? ""}
            onChange={(e) =>
              update("rate_escalation_frequency", numberOrNull(e.target.value))
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>
            Pengingat (hari sebelum jatuh tempo)
          </span>
          <input
            type="number"
            className={inputClass}
            style={inputStyle}
            value={form.reminder_days_before ?? ""}
            onChange={(e) =>
              update("reminder_days_before", numberOrNull(e.target.value))
            }
          />
        </label>
      </div>
    </div>
  );
}

export function BillingPolicyManager({
  scopes,
}: {
  scopes: Array<{ label: string; scope: PolicyScope }>;
}) {
  return (
    <div className="space-y-6">
      <h1
        className="text-2xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Kebijakan Tagihan
      </h1>
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        Atur default sistem dan penggantian per lokasi. Bidang kosong akan
        mewarisi nilai dari tingkat di atasnya.
      </p>
      {scopes.map((s) => (
        <PolicyForm
          key={s.scope.location_id ?? "system"}
          label={s.label}
          scope={s.scope}
        />
      ))}
    </div>
  );
}
