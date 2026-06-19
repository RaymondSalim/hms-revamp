import { z } from "zod";

export const tenantSchema = z.object({
  name: z.string().min(1, "Nama harus diisi"),
  id_number: z.string().min(1, "Nomor identitas harus diisi"),
  email: z.string().email("Alamat email tidak valid").optional().or(z.literal("")),
  phone: z.string().optional(),
  current_address: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  referral_source: z.string().optional(),
  id_file: z.string().optional(),
  id_file_name: z.string().optional(),
  family_certificate_file: z.string().optional(),
  family_certificate_file_name: z.string().optional(),
  second_resident_name: z.string().optional(),
  second_resident_email: z.string().optional(),
  second_resident_phone: z.string().optional(),
  second_resident_id_number: z.string().optional(),
  second_resident_id_file: z.string().optional(),
  second_resident_id_file_name: z.string().optional(),
  second_resident_relation: z.string().optional(),
}).superRefine((data, ctx) => {
  const hasAnySecondResident = !!(
    data.second_resident_name || data.second_resident_email ||
    data.second_resident_phone || data.second_resident_id_number ||
    data.second_resident_relation
  );
  if (hasAnySecondResident) {
    if (!data.second_resident_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "'Nama' harus diisi jika salah satu field penghuni kedua diisi", path: ["second_resident_name"] });
    }
    if (!data.second_resident_id_number) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "'Nomor identitas' harus diisi jika salah satu field penghuni kedua diisi", path: ["second_resident_id_number"] });
    }
  }
});
