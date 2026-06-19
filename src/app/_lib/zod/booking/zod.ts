import { z } from "zod";

export const bookingSchema = z.object({
  room_id: z.number().min(1, "Kamar harus dipilih"),
  start_date: z.coerce.date(),
  duration_id: z.number().nullable(),
  fee: z.number().min(1, "Fee should be greater than 0"),
  tenant_id: z.string().min(1, "Penyewa harus dipilih"),
  is_rolling: z.boolean(),
  status_id: z.number().min(1),
  second_resident_fee: z.number().nullable().optional(),
  deposit_amount: z.number().min(0).optional(),
}).refine(
  (data) => !(data.is_rolling && data.duration_id),
  { message: "Duration ID must be null for rolling bookings", path: ["duration_id"] }
);
