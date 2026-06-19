import { prisma } from "@/app/_lib/prisma";

export async function getSetting(key: string) {
  return prisma.setting.findUnique({ where: { setting_key: key } });
}

export async function getSettingValue(key: string): Promise<string | null> {
  const setting = await getSetting(key);
  return setting?.setting_value ?? null;
}

export async function upsertSetting(key: string, value: string) {
  return prisma.setting.upsert({
    where: { setting_key: key },
    update: { setting_value: value },
    create: { setting_key: key, setting_value: value },
  });
}

export async function getAppSetup(): Promise<boolean> {
  const val = await getSettingValue("APP_SETUP");
  return val === "true";
}

export async function getRegistrationEnabled(): Promise<boolean> {
  const val = await getSettingValue("REGISTRATION_ENABLED");
  return val?.toLowerCase() === "true";
}

export async function getCompanyName(): Promise<string> {
  const val = await getSettingValue("COMPANY_NAME");
  return val || "Perusahaan Anda";
}

export async function getCompanyImage(): Promise<string> {
  const val = await getSettingValue("COMPANY_IMAGE");
  return val || "";
}
