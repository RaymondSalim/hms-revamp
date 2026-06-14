"use client";

import { useState } from "react";
import Link from "next/link";
import { confirmResetAction } from "./confirm-action";

export function ConfirmResetForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await confirmResetAction({
      email,
      token,
      password,
      confirmPassword,
    });
    setLoading(false);
    if (result.success) setDone(true);
    else setError(result.error);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-6">
          Buat Kata Sandi Baru
        </h1>

        {done ? (
          <div className="text-center space-y-4">
            <div className="text-green-600 bg-green-50 p-4 rounded-md">
              Kata sandi Anda telah diperbarui. Silakan masuk dengan kata sandi
              baru Anda.
            </div>
            <Link
              href="/login"
              className="inline-block text-blue-600 hover:underline text-sm"
            >
              Ke halaman masuk
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Kata Sandi Baru
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Minimal 8 karakter"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Konfirmasi Kata Sandi
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ulangi kata sandi baru"
              />
            </div>

            {error && (
              <div className="text-red-600 bg-red-50 p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Memproses..." : "Simpan Kata Sandi"}
            </button>

            <div className="text-center text-sm text-gray-600">
              <Link href="/login" className="text-blue-600 hover:underline">
                Kembali ke halaman masuk
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
