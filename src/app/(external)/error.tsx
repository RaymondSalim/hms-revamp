"use client";

import { useEffect } from "react";
import { ErrorState } from "@/app/_components/error-state";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Auth route error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <ErrorState error={error} reset={reset} />
    </div>
  );
}
