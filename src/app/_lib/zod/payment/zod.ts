import { z } from "zod";

export const paymentSchema = z.object({
  booking_id: z.number().min(1),
  amount: z.number().min(1, "Jumlah harus lebih dari 0"),
  payment_date: z.coerce.date(),
  status_id: z.number().optional(),
  allocation_mode: z.enum(["auto", "manual"]),
  manual_allocations: z.array(z.object({
    bill_id: z.number(),
    amount: z.number().min(0),
  })).optional(),
});
