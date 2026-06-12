"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";
import { logAudit } from "@/app/_lib/audit";
import { upsertSetting } from "@/app/_db/settings";
import { validateImageDataUrl } from "@/app/_lib/util/image-data-url";

export interface CompanySettingsInput {
  companyName: string;
  companyImage: string;
}

export async function updateCompanySettingsAction(input: CompanySettingsInput) {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return { success: false as const, error: "Unauthorized" };

  if (!input.companyName.trim()) {
    return { success: false as const, error: "Nama perusahaan harus diisi" };
  }

  // Empty string clears the logo; a non-empty value must be a valid image data URL.
  if (input.companyImage) {
    const validation = validateImageDataUrl(input.companyImage);
    if (!validation.ok) {
      return { success: false as const, error: validation.error };
    }
  }

  try {
    await upsertSetting("COMPANY_NAME", input.companyName.trim());
    await upsertSetting("COMPANY_IMAGE", input.companyImage);

    await logAudit(`company_settings.update: name=${input.companyName.trim()}`);
    revalidatePath("/settings/company");
    revalidatePath("/", "layout");
    return { success: true as const };
  } catch (e: unknown) {
    console.error("Company settings update error:", e);
    return { success: false as const, error: "Gagal menyimpan pengaturan" };
  }
}
