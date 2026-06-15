"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 14 * 60 * 1000; // Poll every 14 minutes (token rotates every 15 min)

export function SessionRefresh() {
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      if (res.status === 401 || res.status === 403) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!data?.user) {
        router.push("/login");
      }
    } catch {
      // Network error — skip, will retry next interval
    }
  }, [router]);

  useEffect(() => {
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return null;
}
