import { redirect } from "next/navigation";
import { getAppSetup } from "@/app/_db/settings";
import SetupForm from "./setup-form";

export default async function FirstTimeSetupPage() {
  const isSetup = await getAppSetup();
  if (isSetup) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg-primary)" }}>
      <div className="max-w-md w-full p-8 bg-white rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]">
        <SetupForm />
      </div>
    </div>
  );
}
