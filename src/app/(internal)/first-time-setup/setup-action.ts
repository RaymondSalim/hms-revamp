"use server";

import { upsertSetting } from "@/app/_db/settings";
import { createLocation } from "@/app/_db/locations";
import { setupSchema } from "@/app/_lib/zod/settings/zod";
import { validateImageDataUrl } from "@/app/_lib/util/image-data-url";

export async function completeSetupAction(formData: {
  companyName: string;
  companyImage?: string;
  companyImageName?: string;
  locationName: string;
  locationAddress: string;
}) {
  const parsed = setupSchema.safeParse(formData);
  if (!parsed.success) return { success: false as const, error: parsed.error.flatten() };

  let companyImage = "";

  if (formData.companyImage) {
    const validation = validateImageDataUrl(formData.companyImage);
    if (!validation.ok) {
      return {
        success: false as const,
        error: { fieldErrors: { companyImage: [validation.error] }, formErrors: [] },
      };
    }
    companyImage = formData.companyImage;
  }

  await upsertSetting("COMPANY_NAME", formData.companyName);
  await upsertSetting("COMPANY_IMAGE", companyImage);
  await createLocation({ name: formData.locationName, address: formData.locationAddress });
  await upsertSetting("APP_SETUP", "true");

  return { success: true as const };
}
