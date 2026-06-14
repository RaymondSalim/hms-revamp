"use client";

import { useState, useTransition } from "react";
import { FileUpload } from "@/app/_components/file-upload";
import { updateCompanySettingsAction } from "./company-action";

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none";
const inputStyle = {
  backgroundColor: "var(--color-bg-primary)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
};

export function CompanySettingsForm({
  initialName,
  initialImage,
  initialRegistrationEnabled,
}: {
  initialName: string;
  initialImage: string;
  initialRegistrationEnabled: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [image, setImage] = useState(initialImage);
  const [registrationEnabled, setRegistrationEnabled] = useState(
    initialRegistrationEnabled,
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCompanySettingsAction({
        companyName: name,
        companyImage: image,
        registrationEnabled,
      });
      if (result.success) setSaved(true);
      else setError(result.error ?? "Gagal menyimpan");
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Profil Perusahaan
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Ubah nama dan logo perusahaan yang ditampilkan di aplikasi.
        </p>
      </div>

      <div
        className="rounded-lg border p-6 space-y-5 max-w-2xl"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="text-sm text-green-600 font-medium">
              Tersimpan
            </span>
          )}
          {error && (
            <span className="text-sm text-red-600 font-medium">{error}</span>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>

        <div className="space-y-1">
          <label
            className="text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Nama Perusahaan
          </label>
          <input
            className={inputClass}
            style={inputStyle}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        <div className="space-y-2">
          {image && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt="Logo saat ini"
                className="w-16 h-16 rounded-lg object-cover border"
                style={{ borderColor: "var(--color-border)" }}
              />
              <button
                type="button"
                onClick={() => {
                  setImage("");
                  setSaved(false);
                }}
                className="text-sm font-medium text-red-600 hover:underline"
              >
                Hapus logo
              </button>
            </div>
          )}
          <FileUpload
            accept="image/*"
            maxSize={1024 * 1024}
            label="Logo Perusahaan"
            preview={false}
            onFileSelect={(base64) => {
              setImage(base64);
              setSaved(false);
            }}
          />
        </div>

        <div
          className="flex items-start justify-between gap-4 border-t pt-5"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="space-y-1">
            <label
              className="text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Pendaftaran Mandiri
            </label>
            <p
              className="text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Izinkan orang membuat akun sendiri melalui halaman pendaftaran.
              Akun baru tidak memiliki hak akses apa pun hingga admin
              menetapkan peran dan lokasi. Sebaiknya tetap nonaktif kecuali
              sedang dibutuhkan.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={registrationEnabled}
            onClick={() => {
              setRegistrationEnabled((v) => !v);
              setSaved(false);
            }}
            className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
            style={{
              backgroundColor: registrationEnabled
                ? "var(--color-accent)"
                : "var(--color-border)",
            }}
          >
            <span
              className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              style={{
                transform: registrationEnabled
                  ? "translateX(1.5rem)"
                  : "translateX(0.25rem)",
              }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
