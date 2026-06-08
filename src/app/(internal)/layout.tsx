import { redirect } from "next/navigation";
import { auth } from "@/app/_lib/auth";

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  if (session.user.shouldReset) {
    redirect("/change-password");
  }

  return <>{children}</>;
}
