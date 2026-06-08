"use server";

import { createTenant, updateTenant, deleteTenant } from "@/app/_db/tenant";
import { uploadToS3, deleteFromS3 } from "@/app/_lib/s3";
import { tenantSchema } from "@/app/_lib/zod/tenant/zod";
import { revalidatePath } from "next/cache";

export async function upsertTenantAction(data: {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  id_number: string;
  current_address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  referral_source?: string;
  id_file?: string; // base64
  id_file_name?: string;
  family_certificate_file?: string; // base64
  family_certificate_file_name?: string;
  second_resident_name?: string;
  second_resident_email?: string;
  second_resident_phone?: string;
  second_resident_id_number?: string;
  second_resident_id_file?: string; // base64
  second_resident_id_file_name?: string;
  second_resident_relation?: string;
}) {
  const parsed = tenantSchema.safeParse(data);
  if (!parsed.success) return { success: false as const, error: parsed.error.flatten() };

  const uploadedKeys: string[] = [];

  try {
    let id_file_key: string | undefined;
    let family_cert_key: string | undefined;
    let second_id_key: string | undefined;

    if (data.id_file && data.id_file_name) {
      const buffer = Buffer.from(data.id_file.split(",")[1], "base64");
      const contentType = data.id_file.split(";")[0].split(":")[1];
      const key = `tenants/id/${new Date().toISOString()}/${data.name}_${data.id_file_name}`;
      await uploadToS3(key, buffer, contentType);
      uploadedKeys.push(key);
      id_file_key = key;
    }

    if (data.family_certificate_file && data.family_certificate_file_name) {
      const buffer = Buffer.from(data.family_certificate_file.split(",")[1], "base64");
      const contentType = data.family_certificate_file.split(";")[0].split(":")[1];
      const key = `tenants/family-certificate/${new Date().toISOString()}/${data.family_certificate_file_name}`;
      await uploadToS3(key, buffer, contentType);
      uploadedKeys.push(key);
      family_cert_key = key;
    }

    if (data.second_resident_id_file && data.second_resident_id_file_name) {
      const buffer = Buffer.from(data.second_resident_id_file.split(",")[1], "base64");
      const contentType = data.second_resident_id_file.split(";")[0].split(":")[1];
      const key = `tenants/id/${new Date().toISOString()}/${data.second_resident_name}_${data.second_resident_id_file_name}`;
      await uploadToS3(key, buffer, contentType);
      uploadedKeys.push(key);
      second_id_key = key;
    }

    const tenantData = {
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      id_number: data.id_number,
      current_address: data.current_address || undefined,
      emergency_contact_name: data.emergency_contact_name || undefined,
      emergency_contact_phone: data.emergency_contact_phone || undefined,
      referral_source: data.referral_source || undefined,
      second_resident_name: data.second_resident_name || undefined,
      second_resident_email: data.second_resident_email || undefined,
      second_resident_phone: data.second_resident_phone || undefined,
      second_resident_id_number: data.second_resident_id_number || undefined,
      second_resident_relation: data.second_resident_relation || undefined,
      ...(id_file_key && { id_file: id_file_key }),
      ...(family_cert_key && { family_certificate_file: family_cert_key }),
      ...(second_id_key && { second_resident_id_file: second_id_key }),
    };

    if (data.id) {
      await updateTenant(data.id, tenantData);
    } else {
      await createTenant(tenantData);
    }

    revalidatePath("/residents/tenants");
    return { success: true as const };
  } catch (error) {
    // Cleanup uploaded files on failure
    for (const key of uploadedKeys) {
      try {
        await deleteFromS3(key);
      } catch {
        // ignore cleanup errors
      }
    }
    return { success: false as const, error: "Error saving tenant" };
  }
}

export async function deleteTenantAction(id: string) {
  await deleteTenant(id);
  revalidatePath("/residents/tenants");
  return { success: true };
}
