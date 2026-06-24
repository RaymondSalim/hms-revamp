import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/app/_lib/auth";

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.shouldReset) {
    const headerList = await headers();
    const pathname = headerList.get("x-pathname") ?? "";
    if (!pathname.startsWith("/change-password")) {
      redirect("/change-password");
    }
  }

  return <>{children}</>;
}
