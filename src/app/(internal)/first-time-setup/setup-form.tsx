"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { FileUpload } from "@/app/_components/file-upload";
import { completeSetupAction } from "./setup-action";

export default function SetupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(0);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [companyImage, setCompanyImage] = useState("");
  const [companyImageName, setCompanyImageName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");

  // Errors
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function nextStep() {
    if (step === 1) {
      if (!companyName.trim()) {
        setErrors({ companyName: ["Nama perusahaan harus diisi"] });
        return;
      }
      setErrors({});
    }
    setStep((s) => s + 1);
  }

  function prevStep() {
    setErrors({});
    setStep((s) => s - 1);
  }

  function handleSubmit() {
    if (!locationName.trim() || !locationAddress.trim()) {
      const errs: Record<string, string[]> = {};
      if (!locationName.trim()) errs.locationName = ["Nama lokasi harus diisi"];
      if (!locationAddress.trim()) errs.locationAddress = ["Alamat lokasi harus diisi"];
      setErrors(errs);
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = await completeSetupAction({
        companyName,
        companyImage: companyImage || undefined,
        companyImageName: companyImageName || undefined,
        locationName,
        locationAddress,
      });

      if (result.success) {
        router.push("/dashboard");
      } else {
        if (result.error) {
          setErrors(result.error.fieldErrors as Record<string, string[]>);
        }
        toast.error("Terjadi kesalahan saat menyimpan. Silakan coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i <= step ? "var(--color-accent)" : "var(--color-border)",
              transform: i === step ? "scale(1.3)" : "scale(1)",
            }}
          />
        ))}
      </div>

      {/* Step 0: Introduction */}
      {step === 0 && (
        <div className="text-center space-y-4">
          <h1
            className="text-3xl font-bold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-text-primary)" }}
          >
            Selamat Datang!
          </h1>
          <p
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Mari mengatur aplikasi Anda dalam beberapa langkah mudah.
          </p>
          <button
            type="button"
            onClick={nextStep}
            className="w-full py-2.5 px-4 text-white font-medium rounded-[var(--radius-md)] transition-colors hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Mulai
          </button>
        </div>
      )}

      {/* Step 1: Company Info */}
      {step === 1 && (
        <div className="space-y-5">
          <h2
            className="text-xl font-bold text-center"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-text-primary)" }}
          >
            Informasi Perusahaan
          </h2>

          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Nama Perusahaan
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Masukkan nama perusahaan"
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm outline-none transition-all"
              style={{
                borderColor: errors.companyName ? "var(--color-error, #dc2626)" : "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-border-focus)")}
              onBlur={(e) => (e.target.style.borderColor = errors.companyName ? "var(--color-error, #dc2626)" : "var(--color-border)")}
            />
            {errors.companyName && (
              <p className="text-xs text-red-600">{errors.companyName[0]}</p>
            )}
          </div>

          <FileUpload
            accept="image/*"
            maxSize={1024 * 1024}
            label="Logo Perusahaan"
            onFileSelect={(base64, fileName) => {
              setCompanyImage(base64);
              setCompanyImageName(fileName);
            }}
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={prevStep}
              className="flex-1 py-2.5 px-4 font-medium rounded-[var(--radius-md)] border transition-colors hover:opacity-80 text-sm"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={nextStep}
              className="flex-1 py-2.5 px-4 text-white font-medium rounded-[var(--radius-md)] transition-colors hover:opacity-90 text-sm"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Location */}
      {step === 2 && (
        <div className="space-y-5">
          <h2
            className="text-xl font-bold text-center"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-text-primary)" }}
          >
            Lokasi Pertama
          </h2>

          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Nama Lokasi
            </label>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Masukkan nama lokasi"
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm outline-none transition-all"
              style={{
                borderColor: errors.locationName ? "var(--color-error, #dc2626)" : "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-border-focus)")}
              onBlur={(e) => (e.target.style.borderColor = errors.locationName ? "var(--color-error, #dc2626)" : "var(--color-border)")}
            />
            {errors.locationName && (
              <p className="text-xs text-red-600">{errors.locationName[0]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Alamat
            </label>
            <input
              type="text"
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              placeholder="Masukkan alamat lokasi"
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm outline-none transition-all"
              style={{
                borderColor: errors.locationAddress ? "var(--color-error, #dc2626)" : "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-border-focus)")}
              onBlur={(e) => (e.target.style.borderColor = errors.locationAddress ? "var(--color-error, #dc2626)" : "var(--color-border)")}
            />
            {errors.locationAddress && (
              <p className="text-xs text-red-600">{errors.locationAddress[0]}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={prevStep}
              className="flex-1 py-2.5 px-4 font-medium rounded-[var(--radius-md)] border transition-colors hover:opacity-80 text-sm"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 py-2.5 px-4 text-white font-medium rounded-[var(--radius-md)] transition-colors hover:opacity-90 text-sm disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isPending ? "Menyimpan..." : "Selesai"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
