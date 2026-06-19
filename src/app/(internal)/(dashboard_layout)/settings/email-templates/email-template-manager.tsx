"use client";

import { useState, useTransition, useMemo } from "react";
import {
  upsertEmailTemplateAction,
  sendTestEmailAction,
  saveInvoiceFilenameAction,
  generateTestPdfAction,
  type EmailTemplateInput,
} from "./email-template-action";
import { DEFAULT_EMAIL_LAYOUT } from "@/app/_lib/email/template-keys";
import { EmailEditor } from "@/app/_components/email-editor";

export interface TemplateRow {
  template_key: string;
  label: string;
  variables: string[];
  subject: string;
  body_html: string;
  is_enabled: boolean;
}

const SAMPLE_ITEMS_TABLE = `<table><thead><tr><th>Deskripsi</th><th>Jumlah</th></tr></thead><tbody>
<tr><td>Sewa Kamar - Juni 2026</td><td>Rp 3.500.000</td></tr>
<tr><td>Listrik</td><td>Rp 150.000</td></tr>
</tbody></table>`;

const SAMPLE_VARS: Record<string, string> = {
  tenant_name: "Budi Santoso",
  room_number: "A-201",
  bill_description: "Sewa Bulan Juni 2026",
  outstanding: "Rp 3.150.000",
  due_date: "25 Jun 2026",
  reset_link: "https://app.example.com/reset?token=abc123",
  company_name: "MICASA Suites",
  company_logo_url:
    '<img src="https://via.placeholder.com/120x48/1e293b/ffffff?text=LOGO" alt="Logo" style="max-height:48px;margin-bottom:8px;">',
  content:
    "<p>Ini adalah konten email yang akan ditampilkan di dalam layout.</p>",
  invoice_number: "INV/2026/06/001",
  location_name: "MICASA Suites",
  location_address: "Jl. Contoh No. 123, Jakarta",
  description: "Sewa Bulan Juni 2026",
  items_table: SAMPLE_ITEMS_TABLE,
  subtotal: "Rp 3.650.000",
  tax: "Rp 0",
  total: "Rp 3.650.000",
  paid: "Rp 500.000",
};

function renderPreview(
  bodyHtml: string,
  layoutHtml: string | null,
  templateKey: string
): string {
  let rendered = bodyHtml;
  for (const [key, val] of Object.entries(SAMPLE_VARS)) {
    rendered = rendered.replace(
      new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"),
      val
    );
  }

  if (templateKey === "EMAIL_LAYOUT" || templateKey === "INVOICE_PDF") {
    return rendered;
  }

  if (layoutHtml) {
    let layout = layoutHtml;
    const layoutVars: Record<string, string> = {
      content: rendered,
      company_name: SAMPLE_VARS.company_name,
      company_logo_url: SAMPLE_VARS.company_logo_url,
    };
    for (const [key, val] of Object.entries(layoutVars)) {
      layout = layout.replace(
        new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"),
        val
      );
    }
    return layout;
  }

  return rendered;
}

export function EmailTemplateManager({
  templates,
  invoiceFilename: initialFilename,
}: {
  templates: TemplateRow[];
  invoiceFilename: string;
}) {
  const [activeKey, setActiveKey] = useState(templates[0]?.template_key ?? "");
  const [bodies, setBodies] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const t of templates) map[t.template_key] = t.body_html;
    return map;
  });
  const [subjects, setSubjects] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const t of templates) map[t.template_key] = t.subject;
    return map;
  });
  const [enableds, setEnableds] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const t of templates) map[t.template_key] = t.is_enabled;
    return map;
  });
  const [invoiceFilename, setInvoiceFilename] = useState(initialFilename);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [rawMode, setRawMode] = useState(
    templates[0]?.template_key === "EMAIL_LAYOUT" ||
      templates[0]?.template_key === "INVOICE_PDF"
  );

  const activeTemplate = templates.find((t) => t.template_key === activeKey);
  const isLayout = activeKey === "EMAIL_LAYOUT";
  const isInvoicePdf = activeKey === "INVOICE_PDF";
  const layoutBody = bodies["EMAIL_LAYOUT"] || DEFAULT_EMAIL_LAYOUT;

  const previewHtml = useMemo(() => {
    const body = bodies[activeKey] || "";
    return renderPreview(body, isLayout ? null : layoutBody, activeKey);
  }, [bodies, activeKey, isLayout, layoutBody]);

  function handleSave() {
    setError(null);
    setSaved(false);
    const input: EmailTemplateInput = {
      template_key: activeKey,
      subject: subjects[activeKey] || "",
      body_html: bodies[activeKey] || "",
      is_enabled: enableds[activeKey] ?? true,
    };
    startTransition(async () => {
      const result = await upsertEmailTemplateAction(input);
      if (!result.success) {
        setError(result.error ?? "Gagal menyimpan");
        return;
      }
      if (activeKey === "INVOICE_PDF") {
        const fnResult = await saveInvoiceFilenameAction(invoiceFilename);
        if (!fnResult.success) {
          setError(fnResult.error ?? "Gagal menyimpan nama file");
          return;
        }
      }
      setSaved(true);
    });
  }

  function handleReset() {
    const original = templates.find((t) => t.template_key === activeKey);
    if (!original) return;
    const defaultBody =
      activeKey === "EMAIL_LAYOUT"
        ? DEFAULT_EMAIL_LAYOUT
        : original.body_html;
    setBodies((prev) => ({ ...prev, [activeKey]: defaultBody }));
    setSubjects((prev) => ({ ...prev, [activeKey]: original.subject }));
    setSaved(false);
  }

  async function handleSendTest() {
    setSendingTest(true);
    setTestSent(null);
    setError(null);
    const result = await sendTestEmailAction(
      activeKey,
      bodies[activeKey] || "",
      subjects[activeKey] || ""
    );
    setSendingTest(false);
    if (result.success) {
      setTestSent(result.email ?? null);
      setTimeout(() => setTestSent(null), 5000);
    } else {
      setError(result.error ?? "Gagal mengirim test email");
    }
  }

  async function handleTestPdf() {
    setSendingTest(true);
    setError(null);
    const result = await generateTestPdfAction(bodies[activeKey] || "");
    setSendingTest(false);
    if (result.success && result.base64) {
      const blob = new Blob(
        [Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0))],
        { type: "application/pdf" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "invoice-test.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } else {
      setError(result.error ?? "Gagal generate PDF test");
    }
  }

  function updateBody(val: string) {
    setBodies((prev) => ({ ...prev, [activeKey]: val }));
    setSaved(false);
  }

  function updateSubject(val: string) {
    setSubjects((prev) => ({ ...prev, [activeKey]: val }));
    setSaved(false);
  }

  function toggleEnabled(val: boolean) {
    setEnableds((prev) => ({ ...prev, [activeKey]: val }));
    setSaved(false);
  }

  function insertVariable(v: string) {
    const tag = `{{${v}}}`;
    updateBody((bodies[activeKey] || "") + tag);
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] -m-6">
      {/* Left sidebar — template list */}
      <div
        className="w-56 flex-shrink-0 border-r flex flex-col"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg-card)",
        }}
      >
        <div className="px-4 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h1
            className="text-lg font-semibold"
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-display), serif",
            }}
          >
            Template Email
          </h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {templates.map((t) => {
            const active = t.template_key === activeKey;
            return (
              <button
                key={t.template_key}
                onClick={() => {
                  setActiveKey(t.template_key);
                  setSaved(false);
                  setError(null);
                  if (
                    t.template_key === "EMAIL_LAYOUT" ||
                    t.template_key === "INVOICE_PDF"
                  ) {
                    setRawMode(true);
                  }
                }}
                className="w-full text-left px-4 py-3 text-sm transition-colors"
                style={{
                  backgroundColor: active
                    ? "var(--color-accent-light)"
                    : "transparent",
                  color: active
                    ? "var(--color-accent)"
                    : "var(--color-text-primary)",
                  fontWeight: active ? 600 : 400,
                  borderLeft: active
                    ? "3px solid var(--color-accent)"
                    : "3px solid transparent",
                }}
              >
                <span className="block truncate">{t.label}</span>
                {!enableds[t.template_key] && (
                  <span
                    className="text-[10px] uppercase font-semibold"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Nonaktif
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right side — editor + preview */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-card)",
          }}
        >
          <div className="flex items-center gap-3">
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {activeTemplate?.label}
            </h2>
            <label
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <input
                type="checkbox"
                checked={enableds[activeKey] ?? true}
                onChange={(e) => toggleEnabled(e.target.checked)}
                className="rounded"
              />
              Aktif
            </label>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-green-600 font-medium">
                Tersimpan
              </span>
            )}
            {testSent && (
              <span className="text-xs text-green-600 font-medium">
                Terkirim ke {testSent}
              </span>
            )}
            {error && (
              <span className="text-xs text-red-600 font-medium">{error}</span>
            )}
            <button
              onClick={isInvoicePdf ? handleTestPdf : handleSendTest}
              disabled={sendingTest}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50"
              style={{
                borderColor: "#059669",
                color: "#059669",
              }}
              title={
                isInvoicePdf
                  ? "Download PDF test dengan data contoh"
                  : "Kirim email test dengan data contoh ke email Anda"
              }
            >
              {sendingTest
                ? "Memproses..."
                : isInvoicePdf
                  ? "Download Test PDF"
                  : "Kirim Test"}
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="px-4 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isPending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>

        {/* Subject (not for layout or invoice pdf) */}
        {!isLayout && !isInvoicePdf && (
          <div
            className="px-5 py-3 border-b flex-shrink-0"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg-card)",
            }}
          >
            <label
              className="text-xs font-medium mb-1 block"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Subjek
            </label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              value={subjects[activeKey] || ""}
              onChange={(e) => updateSubject(e.target.value)}
            />
          </div>
        )}

        {/* Filename pattern (only for invoice PDF) */}
        {isInvoicePdf && (
          <div
            className="px-5 py-3 border-b flex-shrink-0"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg-card)",
            }}
          >
            <label
              className="text-xs font-medium mb-1 block"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Nama File PDF (tanpa .pdf)
            </label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              value={invoiceFilename}
              onChange={(e) => {
                setInvoiceFilename(e.target.value);
                setSaved(false);
              }}
              placeholder="invoice-{{invoice_number}}"
            />
            <p
              className="text-[11px] mt-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Variabel: {`{{invoice_number}}, {{tenant_name}}, {{room_number}}, {{due_date}}`}
            </p>
          </div>
        )}

        {/* Variables bar */}
        <div
          className="px-5 py-2 border-b flex items-center gap-2 flex-shrink-0 flex-wrap"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-primary)",
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Variabel:
          </span>
          {activeTemplate?.variables.map((v) => (
            <button
              key={v}
              onClick={() => insertVariable(v)}
              className="px-2 py-0.5 rounded text-xs font-mono transition-colors cursor-pointer"
              style={{
                backgroundColor: "var(--color-bg-card)",
                color: "var(--color-accent)",
                border: "1px solid var(--color-border)",
              }}
              title={`Klik untuk menyisipkan {{${v}}}`}
            >
              {`{{${v}}}`}
            </button>
          ))}
          {isLayout && (
            <span
              className="text-[11px] ml-2"
              style={{ color: "var(--color-text-secondary)" }}
            >
              — <code>{"{{content}}"}</code> akan diganti isi email
            </span>
          )}
          <label
            className="flex items-center gap-1.5 text-xs ml-auto cursor-pointer"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <input
              type="checkbox"
              checked={rawMode}
              onChange={(e) => setRawMode(e.target.checked)}
              className="rounded"
            />
            HTML
          </label>
        </div>

        {/* Split pane: Editor + Preview */}
        <div className="flex-1 flex min-h-0">
          {/* Editor */}
          <div className="flex-1 min-w-0 flex flex-col border-r" style={{ borderColor: "var(--color-border)" }}>
            <div
              className="px-4 py-2 border-b flex-shrink-0"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
              }}
            >
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {rawMode ? "HTML" : "Editor"}
              </span>
            </div>
            <div className="flex-1 overflow-auto">
              {rawMode ? (
                <textarea
                  className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none"
                  style={{
                    backgroundColor: "var(--color-bg-primary)",
                    color: "var(--color-text-primary)",
                  }}
                  value={bodies[activeKey] || ""}
                  onChange={(e) => updateBody(e.target.value)}
                />
              ) : (
                <EmailEditor
                  key={activeKey}
                  content={bodies[activeKey] || ""}
                  onChange={updateBody}
                />
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div
              className="px-4 py-2 border-b flex-shrink-0"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
              }}
            >
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {isInvoicePdf ? "Preview PDF" : "Preview"}
              </span>
            </div>
            <div className="flex-1 overflow-hidden" style={{ backgroundColor: "#f4f4f7" }}>
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full border-0"
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
