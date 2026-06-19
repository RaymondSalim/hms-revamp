import Link from "next/link";
import { ConfirmResetForm } from "./confirm-form";

export default async function ConfirmResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await searchParams;

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold">Tautan Tidak Valid</h1>
          <p className="text-sm text-gray-600">
            Tautan reset kata sandi tidak lengkap atau salah. Silakan minta
            tautan baru.
          </p>
          <Link
            href="/reset-password"
            className="inline-block text-blue-600 hover:underline text-sm"
          >
            Minta tautan baru
          </Link>
        </div>
      </div>
    );
  }

  return <ConfirmResetForm token={token} email={email} />;
}
