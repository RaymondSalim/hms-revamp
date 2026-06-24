"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addNoteAction, deleteNoteAction } from "./notes-action";
import { toast } from "react-toastify";
import { useConfirm } from "@/app/_components/confirm-dialog";
import { usePermissions } from "@/app/_context/permissions-context";
import { DEFAULT_DISABLED_REASON } from "@/app/_components/action-menu";

interface NoteItem {
  id: number;
  content: string;
  createdAt: string | Date;
  author: { name: string };
}

function relativeTime(dateInput: string | Date): string {
  const now = Date.now();
  const then = new Date(dateInput).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffHour < 24) return `${diffHour} jam lalu`;
  if (diffDay < 30) return `${diffDay} hari lalu`;
  return new Date(dateInput).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function NotesSection({
  notes,
  tenantId,
}: {
  notes: NoteItem[];
  tenantId: string;
}) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const confirm = useConfirm();
  const router = useRouter();
  const { can } = usePermissions();
  const canDelete = can("roles.manage");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    try {
      const result = await addNoteAction(tenantId, content);
      if (result.success) {
        setContent("");
        toast.success("Catatan ditambahkan");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Gagal menambahkan catatan");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (noteId: number) => {
    if (!(await confirm({ message: "Hapus catatan ini?", danger: true }))) return;
    const result = await deleteNoteAction(noteId);
    if (result.success) {
      toast.success("Catatan dihapus");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <section style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1.5rem" }}>
      <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
        Catatan
      </h2>

      {/* Add note form */}
      <form onSubmit={handleAdd} className="mb-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tambah catatan..."
          rows={3}
          className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-card)",
            color: "var(--color-text-primary)",
          }}
        />
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--color-accent)", color: "white" }}
          >
            {loading ? "Menyimpan..." : "Simpan Catatan"}
          </button>
        </div>
      </form>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-sm italic" style={{ color: "var(--color-text-secondary)" }}>
          Belum ada catatan.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
            >
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-primary)" }}>
                {note.content}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {note.author.name} · <span title={new Date(note.createdAt).toLocaleString("id-ID")}>{relativeTime(note.createdAt)}</span>
                </span>
                <button
                  onClick={() => handleDelete(note.id)}
                  disabled={!canDelete}
                  title={canDelete ? undefined : DEFAULT_DISABLED_REASON}
                  className="text-xs px-2 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: "#DC2626" }}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
