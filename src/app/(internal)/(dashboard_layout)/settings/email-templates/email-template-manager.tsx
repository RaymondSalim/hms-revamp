"use client";

import { useState, useTransition } from "react";
import {
  upsertEmailTemplateAction,
  type EmailTemplateInput,
} from "./email-template-action";

export interface TemplateRow {
  template_key: string;
  label: string;
  variables: string[];
  subject: string;
  body_html: string;
  is_enabled: boolean;
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none";
const inputStyle = {
  backgroundColor: "var(--color-bg-primary)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
};

function TemplateCard({ row }: { row: TemplateRow }) {
  const [subject, setSubject] = useState(row.subject);
  const [body, setBody] = useState(row.body_html);
  const [enabled, setEnabled] = useState(row.is_enabled);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    setSaved(false);
    const input: EmailTemplateInput = {
      template_key: row.template_key,
      subject,
      body_html: body,
      is_enabled: enabled,
    };
    startTransition(async () => {
      const result = await upsertEmailTemplateAction(input);
      if (result.success) setSaved(true);
      else setError(result.error ?? "Gagal menyimpan");
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
          {row.label}
        </h2>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-green-600 font-medium">
              Tersimpan
            </span>
          )}
          {error && (
            <span className="text-sm text-red-600 font-medium">{error}</span>
          )}
          <label
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--color-text-primary)" }}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setSaved(false);
              }}
            />
            Aktif
          </label>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label
          className="text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Subjek
        </label>
        <input
          className={inputClass}
          style={inputStyle}
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      <div className="space-y-1">
        <label
          className="text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Isi Email (HTML)
        </label>
        <textarea
          className={inputClass}
          style={{ ...inputStyle, minHeight: "200px", fontFamily: "monospace" }}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
        Variabel tersedia:{" "}
        {row.variables.map((v) => `{{${v}}}`).join(", ")}
      </p>
    </div>
  );
}

export function EmailTemplateManager({
  templates,
}: {
  templates: TemplateRow[];
}) {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Template Email
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Sesuaikan subjek dan isi email yang dikirim sistem. Gunakan variabel
          dalam tanda kurung kurawal ganda.
        </p>
      </div>
      {templates.map((t) => (
        <TemplateCard key={t.template_key} row={t} />
      ))}
    </div>
  );
}
