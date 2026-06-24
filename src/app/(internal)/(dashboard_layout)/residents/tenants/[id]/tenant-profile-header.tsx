"use client";

import Link from "next/link";

interface TenantHeaderProps {
  tenant: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    id_number: string;
    current_address: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    referral_source: string | null;
    id_file: string | null;
    family_certificate_file: string | null;
    second_resident_name: string | null;
    second_resident_relation: string | null;
    second_resident_of: { id: string; name: string } | null;
  };
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1">
      <span className="text-xs font-medium min-w-[140px]" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </span>
      <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

export function TenantProfileHeader({ tenant }: TenantHeaderProps) {
  return (
    <div
      className="rounded-xl border p-6"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
    >
      <div className="flex items-start justify-between mb-4">
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display), serif", color: "var(--color-text-primary)" }}
        >
          {tenant.name}
        </h1>
        <Link
          href={`/residents/tenants?edit=${tenant.id}`}
          className="px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150"
          style={{ backgroundColor: "var(--color-accent)", color: "white" }}
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InfoRow label="Email" value={tenant.email} />
        <InfoRow label="Telepon" value={tenant.phone} />
        <InfoRow label="NIK" value={tenant.id_number} />
        <InfoRow label="Alamat" value={tenant.current_address} />
        <InfoRow label="Kontak Darurat" value={
          tenant.emergency_contact_name
            ? `${tenant.emergency_contact_name} (${tenant.emergency_contact_phone || "-"})`
            : null
        } />
        <InfoRow label="Sumber Referral" value={tenant.referral_source} />
        <InfoRow label="Penghuni Kedua" value={
          tenant.second_resident_name
            ? `${tenant.second_resident_name} (${tenant.second_resident_relation || ""})`
            : null
        } />
      </div>

      {/* Documents */}
      {(tenant.id_file || tenant.family_certificate_file) && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Dokumen
          </span>
          <div className="flex gap-3 mt-2">
            {tenant.id_file && (
              <a
                href={`/api/files/${encodeURIComponent(tenant.id_file)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
                style={{ color: "var(--color-accent)" }}
              >
                KTP
              </a>
            )}
            {tenant.family_certificate_file && (
              <a
                href={`/api/files/${encodeURIComponent(tenant.family_certificate_file)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
                style={{ color: "var(--color-accent)" }}
              >
                Kartu Keluarga
              </a>
            )}
          </div>
        </div>
      )}

      {/* If this tenant is a second resident of another */}
      {tenant.second_resident_of && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            Penghuni kedua dari{" "}
            <Link
              href={`/residents/tenants/${tenant.second_resident_of.id}`}
              className="underline"
              style={{ color: "var(--color-accent)" }}
            >
              {tenant.second_resident_of.name}
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
