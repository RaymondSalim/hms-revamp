import { z } from "zod";

export const addonPricingSchema = z.object({
  price: z.number().min(0),
  interval_start: z.number().min(0),
  interval_end: z.number().nullable().optional(),
  is_full_payment: z.boolean(),
});

export const addonSchema = z.object({
  name: z.string().min(1, "Nama add-on harus diisi"),
  description: z.string().optional(),
  location_id: z.number().min(1),
  parent_addon_id: z.string().optional(),
  requires_input: z.boolean(),
  pricing: z.array(addonPricingSchema).min(1, "Minimal satu harga harus diisi"),
});
