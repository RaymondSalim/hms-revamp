"use server";

import { upsertSetting } from "@/app/_db/settings";
import { createLocation } from "@/app/_db/locations";
import { setupSchema } from "@/app/_lib/zod/settings/zod";

export async function completeSetupAction(formData: {
  companyName: string;
  companyImage?: string;
  companyImageName?: string;
  locationName: string;
  locationAddress: string;
}) {
  const parsed = setupSchema.safeParse(formData);
  if (!parsed.success) return { success: false as const, error: parsed.error.flatten() };

  let imageKey = "";

  if (formData.companyImage && formData.companyImageName) {
    // For now, store the image path — S3 upload will be wired in Phase 9
    imageKey = `company/${new Date().toISOString()}/${formData.companyImageName}`;
  }

  await upsertSetting("COMPANY_NAME", formData.companyName);
  await upsertSetting("COMPANY_IMAGE", imageKey);
  await createLocation({ name: formData.locationName, address: formData.locationAddress });
  await upsertSetting("APP_SETUP", "true");

  return { success: true as const };
}
