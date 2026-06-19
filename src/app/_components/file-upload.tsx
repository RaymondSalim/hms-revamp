"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "react-toastify";

interface FileUploadProps {
  accept?: string;
  maxSize?: number; // bytes
  onFileSelect: (base64: string, fileName: string, mimeType: string) => void;
  preview?: boolean;
  label?: string;
}

export function FileUpload({
  accept = "image/*",
  maxSize = 5 * 1024 * 1024, // 5MB default
  onFileSelect,
  preview = true,
  label = "Unggah file",
}: FileUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      // Validate type
      if (accept !== "*" && accept !== "*/*") {
        const acceptedTypes = accept.split(",").map((t) => t.trim());
        const isValid = acceptedTypes.some((type) => {
          if (type.endsWith("/*")) {
            const category = type.replace("/*", "");
            return file.type.startsWith(category);
          }
          return file.type === type || file.name.endsWith(type);
        });
        if (!isValid) {
          toast.error(`Tipe file tidak valid. Diterima: ${accept}`);
          return;
        }
      }

      // Validate size
      if (file.size > maxSize) {
        const maxMB = (maxSize / (1024 * 1024)).toFixed(1);
        toast.error(`File terlalu besar. Maksimal ${maxMB} MB`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setFileName(file.name);
        onFileSelect(base64, file.name, file.type);

        if (preview && file.type.startsWith("image/")) {
          setPreviewUrl(base64);
        }
      };
      reader.readAsDataURL(file);
    },
    [accept, maxSize, onFileSelect, preview]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-3">
      {label && (
        <label
          className="block text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {label}
        </label>
      )}

      <div
        className="relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-150"
        style={{
          borderColor: isDragging ? "var(--color-accent)" : "var(--color-border)",
          backgroundColor: isDragging ? "var(--color-accent-light)" : "transparent",
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        {previewUrl ? (
          <div className="space-y-3">
            <img
              src={previewUrl}
              alt="Preview"
              className="mx-auto max-h-32 rounded-lg object-contain"
            />
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {fileName}
            </p>
            <p
              className="text-xs underline"
              style={{ color: "var(--color-accent)" }}
            >
              Klik untuk mengganti
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <svg
              className="mx-auto w-10 h-10"
              viewBox="0 0 20 20"
              fill="currentColor"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
              Seret file ke sini atau{" "}
              <span style={{ color: "var(--color-accent)" }}>klik untuk memilih</span>
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {accept !== "*" && accept !== "*/*" ? `Format: ${accept}` : "Semua format"} | Maks{" "}
              {(maxSize / (1024 * 1024)).toFixed(0)} MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
