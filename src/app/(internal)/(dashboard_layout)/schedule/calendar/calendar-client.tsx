"use client";

import { useState, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import type { EventClickArg, EventInput } from "@fullcalendar/core";
import { upsertEventAction, deleteEventAction } from "./calendar-action";
import { Modal } from "@/app/_components/modal";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps?: {
    type: string;
    eventId?: number;
    bookingId?: number;
    description?: string | null;
    recurring?: boolean;
  };
}

interface CalendarClientProps {
  events: CalendarEvent[];
}

interface EventFormData {
  id?: number;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  backgroundColor: string;
  recurring: boolean;
}

const defaultFormData: EventFormData = {
  title: "",
  description: "",
  start: "",
  end: "",
  allDay: false,
  backgroundColor: "#C2410C",
  recurring: false,
};

const COLOR_OPTIONS = [
  { label: "Terracotta", value: "#C2410C" },
  { label: "Biru", value: "#2563EB" },
  { label: "Ungu", value: "#7C3AED" },
  { label: "Hijau", value: "#059669" },
  { label: "Kuning", value: "#D97706" },
  { label: "Merah", value: "#DC2626" },
];

export function CalendarClient({ events }: CalendarClientProps) {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<EventFormData>(defaultFormData);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDateClick = useCallback((arg: DateClickArg) => {
    setFormData({
      ...defaultFormData,
      start: arg.dateStr,
      allDay: arg.allDay,
    });
    setIsEditing(false);
    setErrorMessage(null);
    setShowModal(true);
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const props = arg.event.extendedProps;

    // Booking events are read-only
    if (props.type === "booking-start" || props.type === "booking-end") {
      return;
    }

    if (props.type === "custom" && props.eventId) {
      setFormData({
        id: props.eventId as number,
        title: arg.event.title,
        description: (props.description as string) || "",
        start: arg.event.startStr,
        end: arg.event.endStr || "",
        allDay: arg.event.allDay,
        backgroundColor:
          arg.event.backgroundColor || "#C2410C",
        recurring: (props.recurring as boolean) || false,
      });
      setIsEditing(true);
      setErrorMessage(null);
      setShowModal(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await upsertEventAction({
        id: formData.id,
        title: formData.title,
        description: formData.description || undefined,
        start: new Date(formData.start),
        end: formData.end ? new Date(formData.end) : undefined,
        allDay: formData.allDay,
        backgroundColor: formData.backgroundColor,
        recurring: formData.recurring,
      });

      if (result.success) {
        setShowModal(false);
        setFormData(defaultFormData);
      } else {
        setErrorMessage("Validasi gagal. Silakan periksa input Anda.");
      }
    } catch {
      setErrorMessage("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!formData.id) return;
    if (!confirm("Apakah Anda yakin ingin menghapus acara ini?")) return;

    setIsSubmitting(true);
    try {
      await deleteEventAction(formData.id);
      setShowModal(false);
      setFormData(defaultFormData);
    } catch {
      setErrorMessage("Gagal menghapus acara.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const calendarEvents: EventInput[] = events.map((evt) => ({
    id: evt.id,
    title: evt.title,
    start: evt.start,
    end: evt.end,
    allDay: evt.allDay,
    backgroundColor: evt.backgroundColor,
    borderColor: evt.borderColor,
    textColor: evt.textColor,
    extendedProps: evt.extendedProps,
  }));

  return (
    <div>
      {/* Calendar Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Kalender
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }}>
            Kelola jadwal dan acara
          </p>
        </div>
        <button
          onClick={() => {
            setFormData(defaultFormData);
            setIsEditing(false);
            setErrorMessage(null);
            setShowModal(true);
          }}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--color-terracotta)" }}
        >
          + Tambah Acara
        </button>
      </div>

      {/* Legend */}
      <div
        className="mb-4 flex flex-wrap gap-4 rounded-lg p-3"
        style={{ backgroundColor: "var(--color-bg-secondary)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: "#C2410C" }}
          />
          <span
            className="text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Acara Kustom
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: "#059669" }}
          />
          <span
            className="text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Check-in
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: "#DC2626" }}
          />
          <span
            className="text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Check-out
          </span>
        </div>
      </div>

      {/* Calendar */}
      <div
        className="rounded-xl border p-4"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={calendarEvents}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          editable={false}
          selectable={true}
          height="auto"
          locale="id"
          buttonText={{
            today: "Hari Ini",
            month: "Bulan",
            week: "Minggu",
            day: "Hari",
          }}
        />
      </div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={isEditing ? "Edit Acara" : "Tambah Acara"}
      >
        {errorMessage && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Judul *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
              placeholder="Nama acara"
            />
          </div>

          {/* Description */}
          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Deskripsi
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
              rows={3}
              placeholder="Deskripsi acara (opsional)"
            />
          </div>

          {/* Start */}
          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Mulai *
            </label>
            <input
              type={formData.allDay ? "date" : "datetime-local"}
              required
              value={formData.start}
              onChange={(e) =>
                setFormData({ ...formData, start: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          {/* End */}
          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Selesai
            </label>
            <input
              type={formData.allDay ? "date" : "datetime-local"}
              value={formData.end}
              onChange={(e) =>
                setFormData({ ...formData, end: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          {/* All Day Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="allDay"
              checked={formData.allDay}
              onChange={(e) =>
                setFormData({ ...formData, allDay: e.target.checked })
              }
              className="h-4 w-4 rounded"
            />
            <label
              htmlFor="allDay"
              className="text-sm"
              style={{ color: "var(--color-text-primary)" }}
            >
              Sepanjang Hari
            </label>
          </div>

          {/* Recurring Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="recurring"
              checked={formData.recurring}
              onChange={(e) =>
                setFormData({ ...formData, recurring: e.target.checked })
              }
              className="h-4 w-4 rounded"
            />
            <label
              htmlFor="recurring"
              className="text-sm"
              style={{ color: "var(--color-text-primary)" }}
            >
              Berulang
            </label>
          </div>

          {/* Color Picker */}
          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Warna
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      backgroundColor: color.value,
                    })
                  }
                  className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color.value,
                    borderColor:
                      formData.backgroundColor === color.value
                        ? "var(--color-text-primary)"
                        : "transparent",
                  }}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "#DC2626" }}
              >
                Hapus
              </button>
            )}
            <div
              className={`flex gap-2 ${!isEditing ? "ml-auto" : ""}`}
            >
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-terracotta)" }}
              >
                {isSubmitting
                  ? "Menyimpan..."
                  : isEditing
                    ? "Perbarui"
                    : "Simpan"}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
