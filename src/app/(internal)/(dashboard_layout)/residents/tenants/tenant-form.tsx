"use client";

import { useState } from "react";
import { FileUpload } from "@/app/_components/file-upload";
import { upsertTenantAction } from "./tenant-action";
import { toast } from "react-toastify";
import type { TenantRow } from "./tenant-table";

interface TenantFormProps {
  tenant: TenantRow | null;
  onSuccess: () => void;
}

export function TenantForm({ tenant, onSuccess }: TenantFormProps) {
  const [loading, setLoading] = useState(false);
  const [showSecondResident, setShowSecondResident] = useState(
    !!(tenant?.second_resident_name || tenant?.second_resident_email || tenant?.second_resident_phone)
  );

  // Form state
  const [name, setName] = useState(tenant?.name || "");
  const [email, setEmail] = useState(tenant?.email || "");
  const [phone, setPhone] = useState(tenant?.phone || "");
  const [idNumber, setIdNumber] = useState(tenant?.id_number || "");
  const [currentAddress, setCurrentAddress] = useState(tenant?.current_address || "");
  const [emergencyContactName, setEmergencyContactName] = useState(tenant?.emergency_contact_name || "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(tenant?.emergency_contact_phone || "");
  const [referralSource, setReferralSource] = useState(tenant?.referral_source || "");

  // File state
  const [idFile, setIdFile] = useState<string | undefined>();
  const [idFileName, setIdFileName] = useState<string | undefined>();
  const [familyCertFile, setFamilyCertFile] = useState<string | undefined>();
  const [familyCertFileName, setFamilyCertFileName] = useState<string | undefined>();

  // Second resident state
  const [secondName, setSecondName] = useState(tenant?.second_resident_name || "");
  const [secondEmail, setSecondEmail] = useState(tenant?.second_resident_email || "");
  const [secondPhone, setSecondPhone] = useState(tenant?.second_resident_phone || "");
  const [secondIdNumber, setSecondIdNumber] = useState(tenant?.second_resident_id_number || "");
  const [secondRelation, setSecondRelation] = useState(tenant?.second_resident_relation || "");
  const [secondIdFile, setSecondIdFile] = useState<string | undefined>();
  const [secondIdFileName, setSecondIdFileName] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await upsertTenantAction({
        id: tenant?.id,
        name,
        email: email || undefined,
        phone: phone || undefined,
        id_number: idNumber,
        current_address: currentAddress || undefined,
        emergency_contact_name: emergencyContactName || undefined,
        emergency_contact_phone: emergencyContactPhone || undefined,
        referral_source: referralSource || undefined,
        id_file: idFile,
        id_file_name: idFileName,
        family_certificate_file: familyCertFile,
        family_certificate_file_name: familyCertFileName,
        second_resident_name: showSecondResident ? secondName || undefined : undefined,
        second_resident_email: showSecondResident ? secondEmail || undefined : undefined,
        second_resident_phone: showSecondResident ? secondPhone || undefined : undefined,
        second_resident_id_number: showSecondResident ? secondIdNumber || undefined : undefined,
        second_resident_relation: showSecondResident ? secondRelation || undefined : undefined,
        second_resident_id_file: showSecondResident ? secondIdFile : undefined,
        second_resident_id_file_name: showSecondResident ? secondIdFileName : undefined,
      });

      if (result.success) {
        toast.success(tenant ? "Penghuni berhasil diperbarui" : "Penghuni berhasil ditambahkan");
        onSuccess();
      } else {
        if (typeof result.error === "string") {
          toast.error(result.error);
        } else {
          const messages = Object.values(result.error?.fieldErrors || {}).flat();
          toast.error(messages[0] || "Validasi gagal");
        }
      }
    } catch {
      toast.error("Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-bg-card)",
    color: "var(--color-text-primary)",
  };

  const labelStyle = {
    color: "var(--color-text-primary)",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-2">
      {/* Primary info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>
            Nama <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>
            No. Identitas (KTP/SIM) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            required
            className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
            style={inputStyle}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>
            Telepon
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" style={labelStyle}>
          Alamat Saat Ini
        </label>
        <textarea
          value={currentAddress}
          onChange={(e) => setCurrentAddress(e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150 resize-none"
          style={inputStyle}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>
            Kontak Darurat (Nama)
          </label>
          <input
            type="text"
            value={emergencyContactName}
            onChange={(e) => setEmergencyContactName(e.target.value)}
            className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>
            Kontak Darurat (Telepon)
          </label>
          <input
            type="text"
            value={emergencyContactPhone}
            onChange={(e) => setEmergencyContactPhone(e.target.value)}
            className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" style={labelStyle}>
          Sumber Referral
        </label>
        <input
          type="text"
          value={referralSource}
          onChange={(e) => setReferralSource(e.target.value)}
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
          style={inputStyle}
        />
      </div>

      {/* File uploads */}
      <FileUpload
        label="Foto KTP/Identitas"
        accept="image/*"
        maxSize={5 * 1024 * 1024}
        onFileSelect={(base64, fileName) => {
          setIdFile(base64);
          setIdFileName(fileName);
        }}
      />

      {/* Second Resident Section */}
      <div
        className="border rounded-xl p-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <button
          type="button"
          onClick={() => setShowSecondResident(!showSecondResident)}
          className="flex items-center gap-2 text-sm font-medium w-full"
          style={{ color: "var(--color-text-primary)" }}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${showSecondResident ? "rotate-90" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Penghuni Kedua
        </button>

        {showSecondResident && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Nama
                </label>
                <input
                  type="text"
                  value={secondName}
                  onChange={(e) => setSecondName(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Hubungan
                </label>
                <input
                  type="text"
                  value={secondRelation}
                  onChange={(e) => setSecondRelation(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Email
                </label>
                <input
                  type="email"
                  value={secondEmail}
                  onChange={(e) => setSecondEmail(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Telepon
                </label>
                <input
                  type="text"
                  value={secondPhone}
                  onChange={(e) => setSecondPhone(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                No. Identitas
              </label>
              <input
                type="text"
                value={secondIdNumber}
                onChange={(e) => setSecondIdNumber(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
                style={inputStyle}
              />
            </div>

            <FileUpload
              label="Foto KTP/Identitas Penghuni Kedua"
              accept="image/*"
              maxSize={5 * 1024 * 1024}
              onFileSelect={(base64, fileName) => {
                setSecondIdFile(base64);
                setSecondIdFileName(fileName);
              }}
            />

            <FileUpload
              label="Kartu Keluarga"
              accept="image/*,.pdf"
              maxSize={3 * 1024 * 1024}
              onFileSelect={(base64, fileName) => {
                setFamilyCertFile(base64);
                setFamilyCertFileName(fileName);
              }}
            />
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "white",
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          {loading ? "Menyimpan..." : tenant ? "Perbarui" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
