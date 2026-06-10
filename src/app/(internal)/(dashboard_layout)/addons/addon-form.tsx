"use client";

import { useState } from "react";

interface PricingTier {
  id?: string;
  price: number;
  interval_start: number;
  interval_end: number | null;
  is_full_payment: boolean;
}

interface AddonRow {
  id: string;
  name: string;
  description: string | null;
  location_id: number | null;
  parent_addon_id: string | null;
  requires_input: boolean;
  pricing: PricingTier[];
}

interface Props {
  addon: AddonRow | null;
  locationId: number;
  existingAddons: { id: string; name: string }[];
  onSubmit: (data: {
    id?: string;
    name: string;
    description?: string;
    location_id: number;
    parent_addon_id?: string;
    requires_input: boolean;
    pricing: Array<{
      id?: string;
      price: number;
      interval_start: number;
      interval_end: number | null;
      is_full_payment: boolean;
    }>;
  }) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

export function AddonForm({ addon, locationId, existingAddons, onSubmit, onCancel, loading }: Props) {
  const [name, setName] = useState(addon?.name ?? "");
  const [description, setDescription] = useState(addon?.description ?? "");
  const [parentAddonId, setParentAddonId] = useState(addon?.parent_addon_id ?? "");
  const [requiresInput, setRequiresInput] = useState(addon?.requires_input ?? false);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>(
    addon?.pricing?.length
      ? addon.pricing.map((p) => ({ ...p }))
      : [{ price: 0, interval_start: 0, interval_end: null, is_full_payment: false }]
  );
  const [errors, setErrors] = useState<string[]>([]);

  const addTier = () => {
    const lastTier = pricingTiers[pricingTiers.length - 1];
    const newStart = lastTier ? (lastTier.interval_end ?? lastTier.interval_start + 1) : 0;
    setPricingTiers([
      ...pricingTiers,
      { price: 0, interval_start: newStart, interval_end: null, is_full_payment: false },
    ]);
  };

  const removeTier = (index: number) => {
    if (pricingTiers.length <= 1) return;
    setPricingTiers(pricingTiers.filter((_, i) => i !== index));
  };

  const updateTier = (index: number, field: keyof PricingTier, value: number | boolean | null) => {
    const updated = [...pricingTiers];
    updated[index] = { ...updated[index], [field]: value };
    setPricingTiers(updated);
  };

  const validate = (): boolean => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("Nama add-on harus diisi");
    if (pricingTiers.length === 0) errs.push("Minimal satu tier harga harus diisi");

    // Check interval overlaps and ordering
    for (let i = 0; i < pricingTiers.length; i++) {
      const tier = pricingTiers[i];
      if (tier.price < 0) errs.push(`Tier ${i + 1}: Harga tidak boleh negatif`);
      if (tier.interval_start < 0) errs.push(`Tier ${i + 1}: Interval start tidak boleh negatif`);

      // Only the last tier may have null interval_end
      if (i < pricingTiers.length - 1 && tier.interval_end === null) {
        errs.push(`Tier ${i + 1}: Hanya tier terakhir yang boleh tanpa interval end`);
      }

      // Check ordering
      if (tier.interval_end !== null && tier.interval_end <= tier.interval_start) {
        errs.push(`Tier ${i + 1}: Interval end harus lebih besar dari interval start`);
      }

      // Check overlap with next
      if (i < pricingTiers.length - 1) {
        const next = pricingTiers[i + 1];
        if (tier.interval_end !== null && next.interval_start < tier.interval_end) {
          errs.push(`Tier ${i + 1} dan ${i + 2}: Interval overlap`);
        }
      }
    }

    setErrors(errs);
    return errs.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onSubmit({
      id: addon?.id,
      name: name.trim(),
      description: description.trim() || undefined,
      location_id: locationId,
      parent_addon_id: parentAddonId || undefined,
      requires_input: requiresInput,
      pricing: pricingTiers,
    });
  };

  // Filter out self from parent options
  const parentOptions = existingAddons.filter((a) => a.id !== addon?.id);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {errors.length > 0 && (
        <div
          className="p-3 rounded-lg text-sm space-y-1"
          style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}
        >
          {errors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
          Nama <span className="text-red-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
          placeholder="Nama add-on"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
          Deskripsi
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
          placeholder="Deskripsi (opsional)"
        />
      </div>

      {/* Parent Addon */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
          Parent Add-on
        </label>
        <select
          value={parentAddonId}
          onChange={(e) => setParentAddonId(e.target.value)}
          className="w-full pl-3 pr-9 py-2.5 text-sm rounded-lg border outline-none"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
        >
          <option value="">-- Tidak ada (top-level) --</option>
          {parentOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Requires Input toggle */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
          Perlu Input
        </label>
        <button
          type="button"
          onClick={() => setRequiresInput(!requiresInput)}
          className="relative w-10 h-5 rounded-full transition-colors duration-200"
          style={{ backgroundColor: requiresInput ? "var(--color-accent)" : "var(--color-border)" }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200"
            style={{ transform: requiresInput ? "translateX(20px)" : "translateX(0)" }}
          />
        </button>
      </div>

      {/* Pricing Tiers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            Tier Harga <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={addTier}
            className="px-3 py-1 text-xs font-medium rounded-lg transition-colors"
            style={{ backgroundColor: "var(--color-accent-light)", color: "var(--color-accent)" }}
          >
            + Tambah Tier
          </button>
        </div>

        <div className="space-y-3">
          {pricingTiers.map((tier, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg border space-y-2"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-primary)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  Tier {idx + 1}
                </span>
                {pricingTiers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTier(idx)}
                    className="px-2 py-0.5 text-xs font-medium rounded transition-colors"
                    style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}
                  >
                    Hapus
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                    Interval Start (bulan)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={tier.interval_start}
                    onChange={(e) => updateTier(idx, "interval_start", parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 text-sm rounded border outline-none"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                    Interval End (bulan)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={tier.interval_end ?? ""}
                    onChange={(e) =>
                      updateTier(idx, "interval_end", e.target.value === "" ? null : parseInt(e.target.value))
                    }
                    placeholder="Perpetual"
                    className="w-full px-2 py-1.5 text-sm rounded border outline-none"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  Harga (IDR)
                </label>
                <input
                  type="number"
                  min={0}
                  value={tier.price}
                  onChange={(e) => updateTier(idx, "price", parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1.5 text-sm rounded border outline-none"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  Bayar Penuh
                </label>
                <button
                  type="button"
                  onClick={() => updateTier(idx, "is_full_payment", !tier.is_full_payment)}
                  className="relative w-8 h-4 rounded-full transition-colors duration-200"
                  style={{
                    backgroundColor: tier.is_full_payment ? "var(--color-accent)" : "var(--color-border)",
                  }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200"
                    style={{ transform: tier.is_full_payment ? "translateX(16px)" : "translateX(0)" }}
                  />
                </button>
                <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {tier.is_full_payment ? "Ya" : "Tidak"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-sm font-medium rounded-lg border"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          {loading ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
    </form>
  );
}
