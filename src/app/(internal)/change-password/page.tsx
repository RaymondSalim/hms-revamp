import { auth } from "@/app/_lib/auth";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  // If user doesn't need to reset, redirect to dashboard
  if (!session.user.shouldReset) {
    redirect("/dashboard");
  }

  return <ChangePasswordForm />;
}
