import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { BillingPolicyManager, type PolicyScope } from "./billing-policy-manager";

function toScope(
  policy: {
    late_fee_type: string | null;
    late_fee_amount: unknown;
    grace_period_days: number | null;
    billing_cycle_day: number | null;
    proration_method: string | null;
    rate_escalation_percentage: unknown;
    rate_escalation_frequency: number | null;
    tax_rate: unknown;
    reminder_days_before: number | null;
  } | null,
  location_id: number | null
): PolicyScope {
  const num = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v.toString());
  return {
    location_id,
    late_fee_type: policy?.late_fee_type ?? null,
    late_fee_amount: num(policy?.late_fee_amount),
    grace_period_days: policy?.grace_period_days ?? null,
    billing_cycle_day: policy?.billing_cycle_day ?? null,
    proration_method: policy?.proration_method ?? null,
    rate_escalation_percentage: num(policy?.rate_escalation_percentage),
    rate_escalation_frequency: policy?.rate_escalation_frequency ?? null,
    tax_rate: num(policy?.tax_rate),
    reminder_days_before: policy?.reminder_days_before ?? null,
  };
}

export default async function BillingSettingsPage() {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return <AccessDenied />;

  const [policies, locations] = await Promise.all([
    prisma.billingPolicy.findMany({ where: { booking_id: null } }),
    prisma.location.findMany({ orderBy: { id: "asc" } }),
  ]);

  const systemPolicy =
    policies.find((p) => p.location_id === null && p.booking_id === null) ??
    null;

  const scopes: Array<{ label: string; scope: PolicyScope }> = [
    { label: "Default Sistem", scope: toScope(systemPolicy, null) },
    ...locations.map((loc) => ({
      label: loc.name,
      scope: toScope(
        policies.find((p) => p.location_id === loc.id) ?? null,
        loc.id
      ),
    })),
  ];

  return <BillingPolicyManager scopes={scopes} />;
}
