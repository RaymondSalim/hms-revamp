import { z } from "zod";

export const roomSchema = z.object({
  room_number: z.string().min(1, "Nomor kamar harus diisi"),
  room_type_id: z.number().min(1, "Tipe kamar harus dipilih"),
  status_id: z.number().min(1),
  location_id: z.number().min(1),
});

export const locationSchema = z.object({
  name: z.string().min(1, "Nama lokasi harus diisi"),
  address: z.string().min(1, "Alamat harus diisi"),
});

export const roomTypeSchema = z.object({
  type: z.string().min(1, "Tipe harus diisi"),
  description: z.string().optional(),
});

export const durationSchema = z.object({
  duration: z.string().min(1, "Durasi harus diisi"),
  month_count: z.number().min(1, "Jumlah bulan harus lebih dari 0"),
});
