"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { ServerDataTable } from "@/app/_components/server-data-table";
import { Modal } from "@/app/_components/modal";
import { ActionMenu, Icons } from "@/app/_components/action-menu";
import { useConfirm } from "@/app/_components/confirm-dialog";
import { toast } from "react-toastify";
import { resendEmailLogAction } from "./email-logs-action";

export interface EmailLogRowData {
  id: number;
  status: string;
  payload: string;
  from: string;
  to: string;
  subject: string | null;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = "SUCCESS" | "FAIL" | null;

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: "Semua", value: null },
  { label: "Berhasil", value: "SUCCESS" },
  { label: "Gagal", value: "FAIL" },
];

function isSuccess(status: string) {
  return status === "SUCCESS";
}

function StatusBadge({ status }: { status: string }) {
  const ok = isSuccess(status);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: ok ? "#ECFDF5" : "#FEF2F2",
        color: ok ? "var(--color-success)" : "var(--color-danger)",
      }}
    >
      {ok ? "Berhasil" : "Gagal"}
    </span>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface Props {
  logs: EmailLogRowData[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  search: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
  status: StatusFilter;
}

export function EmailLogsTable({
  logs,
  total,
  page,
  pageSize,
  pageCount,
  search,
  sortBy,
  sortDir,
  status,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [detailLog, setDetailLog] = useState<EmailLogRowData | null>(null);

  // Status filter lives in the URL alongside the table params. Changing it
  // resets to page 1 but preserves the current search/sort.
  const setStatus = (next: StatusFilter) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next) sp.set("status", next);
    else sp.delete("status");
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const handleResend = async (log: EmailLogRowData) => {
    if (
      !(await confirm({
        title: "Kirim Ulang Email",
        message: `Kirim ulang email ini ke ${log.to}? Email akan dikirim dengan konten yang sama persis (tanpa lampiran).`,
      }))
    )
      return;
    const result = await resendEmailLogAction(log.id);
    if (result.success) {
      toast.success("Email berhasil dikirim ulang");
    } else {
      toast.error(result.error ?? "Gagal mengirim ulang email");
    }
  };

  const columns: ColumnDef<EmailLogRowData, unknown>[] = [
    {
      id: "createdAt",
      header: "Tanggal",
      cell: ({ row }) => (
        <span style={{ color: "var(--color-text-secondary)" }}>
          {formatDateTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "to",
      header: "Penerima",
      cell: ({ row }) => row.original.to,
    },
    {
      id: "subject",
      header: "Subjek",
      cell: ({ row }) => row.original.subject || "-",
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => (
        <ActionMenu
          items={[
            {
              label: "Detail",
              icon: Icons.detail,
              onClick: () => setDetailLog(row.original),
            },
            ...(isSuccess(row.original.status)
              ? [
                  {
                    label: "Kirim Ulang",
                    icon: Icons.email,
                    onClick: () => handleResend(row.original),
                  },
                ]
              : []),
          ]}
          maxInline={2}
        />
      ),
    },
  ];

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-semibold"
          style={{
            fontFamily: "var(--font-display), serif",
            color: "var(--color-text-primary)",
          }}
        >
          Log Email
        </h1>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.value;
          return (
            <button
              key={tab.label}
              onClick={() => setStatus(tab.value)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors duration-150"
              style={{
                backgroundColor: active ? "var(--color-accent)" : "transparent",
                color: active ? "white" : "var(--color-text-primary)",
                borderColor: active ? "var(--color-accent)" : "var(--color-border)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <ServerDataTable
        columns={columns}
        data={logs}
        total={total}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        sortableColumns={["createdAt", "to", "subject", "status"]}
        searchPlaceholder="Cari penerima atau subjek..."
      />

      {/* Detail modal */}
      <Modal
        isOpen={!!detailLog}
        onClose={() => setDetailLog(null)}
        title="Detail Email"
        size="lg"
      >
        {detailLog && (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt style={{ color: "var(--color-text-secondary)" }}>Status</dt>
              <dd>
                <StatusBadge status={detailLog.status} />
              </dd>
              <dt style={{ color: "var(--color-text-secondary)" }}>Tanggal</dt>
              <dd style={{ color: "var(--color-text-primary)" }}>
                {formatDateTime(detailLog.createdAt)}
              </dd>
              <dt style={{ color: "var(--color-text-secondary)" }}>Dari</dt>
              <dd style={{ color: "var(--color-text-primary)" }}>{detailLog.from}</dd>
              <dt style={{ color: "var(--color-text-secondary)" }}>Kepada</dt>
              <dd style={{ color: "var(--color-text-primary)" }}>{detailLog.to}</dd>
              <dt style={{ color: "var(--color-text-secondary)" }}>Subjek</dt>
              <dd style={{ color: "var(--color-text-primary)" }}>
                {detailLog.subject || "-"}
              </dd>
            </dl>

            <div>
              <p
                className="text-sm font-medium mb-2"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {isSuccess(detailLog.status) ? "Konten Email" : "Pesan Kesalahan"}
              </p>
              {isSuccess(detailLog.status) ? (
                <iframe
                  title="Pratinjau email"
                  srcDoc={detailLog.payload}
                  sandbox=""
                  className="w-full rounded-lg border"
                  style={{ borderColor: "var(--color-border)", height: "60vh" }}
                />
              ) : (
                <pre
                  className="text-xs whitespace-pre-wrap rounded-lg border p-3"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg-primary)",
                    color: "var(--color-danger)",
                  }}
                >
                  {detailLog.payload}
                </pre>
              )}
            </div>

            {isSuccess(detailLog.status) && (
              <div className="flex justify-end">
                <button
                  onClick={() => handleResend(detailLog)}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-all duration-150"
                  style={{ backgroundColor: "var(--color-accent)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  Kirim Ulang
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
