import { z } from "zod";

export const depositStatusSchema = z.object({
  deposit_id: z.number(),
  status: z.enum(["UNPAID", "HELD", "APPLIED", "REFUNDED", "PARTIALLY_REFUNDED", "FORFEITED"]),
  refunded_amount: z.number().optional(),
  deposit_amount: z.number(), // passed for validation
}).superRefine((data, ctx) => {
  if (data.status === "REFUNDED" && data.refunded_amount !== data.deposit_amount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Untuk pengembalian dana penuh, jumlah pengembalian dana harus sama dengan jumlah deposit",
      path: ["refunded_amount"],
    });
  }
  if (data.status === "PARTIALLY_REFUNDED" && (data.refunded_amount === undefined || data.refunded_amount >= data.deposit_amount)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Untuk pengembalian dana sebagian, jumlahnya harus lebih kecil dari jumlah deposit",
      path: ["refunded_amount"],
    });
  }
});
