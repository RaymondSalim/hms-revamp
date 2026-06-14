"use client";

import { useState } from "react";
import { resetPasswordAction } from "./reset-action";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    await resetPasswordAction({ email });
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-6">
          Reset Kata Sandi
        </h1>

        {submitted ? (
          <div className="text-center space-y-4">
            <div className="text-green-600 bg-green-50 p-4 rounded-md">
              Jika alamat email terdaftar, kami telah mengirimkan tautan untuk
              mengatur ulang kata sandi ke email Anda. Tautan berlaku 1 jam.
            </div>
            <Link
              href="/login"
              className="inline-block text-blue-600 hover:underline text-sm"
            >
              Kembali ke halaman masuk
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4 text-center">
              Masukkan alamat email Anda dan kami akan mengirimkan tautan untuk
              mengatur ulang kata sandi.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Alamat Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="email@contoh.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Memproses..." : "Reset Kata Sandi"}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-gray-600">
              <Link href="/login" className="text-blue-600 hover:underline">
                Kembali ke halaman masuk
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
