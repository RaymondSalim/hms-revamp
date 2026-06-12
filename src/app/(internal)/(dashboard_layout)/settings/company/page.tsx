import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { getCompanyName, getCompanyImage } from "@/app/_db/settings";
import { CompanySettingsForm } from "./company-settings-form";

export default async function CompanySettingsPage() {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return <AccessDenied />;

  const companyName = await getCompanyName();
  const companyImage = await getCompanyImage();

  return (
    <CompanySettingsForm
      initialName={companyName}
      initialImage={companyImage}
    />
  );
}
