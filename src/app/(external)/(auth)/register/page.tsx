import { redirect } from "next/navigation";
import { getRegistrationEnabled } from "@/app/_db/settings";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  // Self-registration is opt-in. When disabled, never render the form.
  if (!(await getRegistrationEnabled())) {
    redirect("/login");
  }

  return <RegisterForm />;
}
