import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Alamat email tidak valid"),
  password: z.string().min(8, "Kata sandi harus lebih dari 8 karakter").max(32),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Nama harus diisi"),
  email: z.string().email("Alamat email tidak valid"),
  password: z.string().min(8, "Kata sandi harus lebih dari 8 karakter").max(32),
});
