"use server";

import { upsertSetting, getAppSetup } from "@/app/_db/settings";
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
  // One-time setup only. Once APP_SETUP is true this action is closed, otherwise
  // it is an unauthenticated endpoint that can overwrite company settings and
  // spawn locations. (The page redirects post-setup, but the action is callable
  // directly, so the guard must live here too.)
  if (await getAppSetup()) {
    return {
      success: false as const,
      error: { fieldErrors: {}, formErrors: ["Penyiapan sudah selesai"] },
    };
  }

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
