import { z } from "zod";

export const guestSchema = z.object({
  name: z.string().min(1, "Nama tamu harus diisi"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  booking_id: z.number().min(1),
});

export const guestStaySchema = z.object({
  guest_id: z.number().min(1),
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  daily_fee: z.number().min(0, "Biaya harian harus lebih dari 0"),
}).refine(
  (data) => data.end_date >= data.start_date,
  { message: "Tanggal selesai harus setelah tanggal mulai", path: ["end_date"] }
);
