import { PrismaClient } from "@prisma/client";
import { Rng, genName, genPhone, genEmail, genIdNumber } from "../rng";

/**
 * Create `count` tenants with deterministic data via the RNG.
 * A realistic fraction will have emergency contacts, second residents, and referral sources.
 * Returns the created tenant CUIDs (DB-generated).
 */
export async function seedTenants(
  prisma: PrismaClient,
  rng: Rng,
  count: number
): Promise<string[]> {
  const REFERRAL_SOURCES = [
    "Website",
    "Teman",
    "Google",
    "Instagram",
    "Agent",
    "Walk-in",
    "Tokopedia",
  ];

  const ADDRESSES = [
    "Jl. Gatot Subroto No. 10, Jakarta",
    "Jl. Thamrin No. 5, Jakarta",
    "Jl. Rasuna Said Kav. B2, Jakarta",
    "Jl. HR Rasuna Said No. 3, Jakarta",
    "Jl. Senopati No. 22, Jakarta",
    "Jl. Panglima Polim No. 7, Jakarta",
    "Jl. Wolter Monginsidi No. 15, Jakarta",
    "Jl. Blora No. 8, Jakarta",
    "Jl. Kemang Raya No. 45, Jakarta",
    "Jl. Melawai Raya No. 20, Jakarta",
  ];

  const RELATIONS = ["Suami", "Istri", "Saudara", "Teman", "Orang Tua"];

  const tenantsData: Array<{
    name: string;
    email: string | null;
    phone: string;
    id_number: string;
    current_address?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    referral_source?: string;
    second_resident_name?: string;
    second_resident_relation?: string;
    second_resident_email?: string;
    second_resident_phone?: string;
    second_resident_id_number?: string;
  }> = [];

  for (let i = 0; i < count; i++) {
    const name = genName(rng);
    const phone = genPhone(rng);
    const email = rng.bool(0.85) ? genEmail(rng, name) : null;
    const idNumber = genIdNumber(rng);

    const hasAddress = rng.bool(0.7);
    const hasEmergencyContact = rng.bool(0.8);
    const hasReferralSource = rng.bool(0.9);
    const hasSecondResident = rng.bool(0.15); // 15% have second resident

    const tenant: typeof tenantsData[number] = {
      name,
      email,
      phone,
      id_number: idNumber,
    };

    if (hasAddress) {
      tenant.current_address = rng.pick(ADDRESSES);
    }

    if (hasEmergencyContact) {
      tenant.emergency_contact_name = genName(rng);
      tenant.emergency_contact_phone = genPhone(rng);
    }

    if (hasReferralSource) {
      tenant.referral_source = rng.pick(REFERRAL_SOURCES);
    }

    if (hasSecondResident) {
      const secondName = genName(rng);
      tenant.second_resident_name = secondName;
      tenant.second_resident_relation = rng.pick(RELATIONS);
      tenant.second_resident_email = rng.bool(0.8)
        ? genEmail(rng, secondName)
        : undefined;
      tenant.second_resident_phone = genPhone(rng);
      tenant.second_resident_id_number = genIdNumber(rng);
    }

    tenantsData.push(tenant);
  }

  // Batch create
  await prisma.tenant.createMany({
    data: tenantsData,
  });

  // Query back to get the created CUIDs (ordered by id which corresponds to creation order)
  const created = await prisma.tenant.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
    take: count,
  });

  return created.map((t) => t.id);
}
