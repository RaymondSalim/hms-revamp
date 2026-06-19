import { z } from "zod";

export const eventSchema = z.object({
  title: z.string().min(1, "Judul harus diisi"),
  description: z.string().optional(),
  start: z.coerce.date(),
  end: z.coerce.date().optional(),
  allDay: z.boolean().default(false),
  backgroundColor: z.string().optional(),
  recurring: z.boolean().default(false),
});
