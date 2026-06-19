import { z } from "zod";

export const setupSchema = z.object({
  companyName: z.string().min(1, "Nama perusahaan harus diisi"),
  companyImage: z.string().optional(),
  companyImageName: z.string().optional(),
  locationName: z.string().min(1, "Nama lokasi harus diisi"),
  locationAddress: z.string().min(1, "Alamat lokasi harus diisi"),
});

export const changePasswordSchema = z.object({
  password: z.string().min(8, "Kata sandi harus lebih dari 8 karakter").max(32),
  confirmPassword: z.string(),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "Kata sandi tidak cocok", path: ["confirmPassword"] }
);
