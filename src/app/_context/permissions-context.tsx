"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/** Pure, render-free permission checker. Exported for unit testing in node env. */
export function buildCan(permissions: string[]): (permission: string) => boolean {
  const set = new Set(permissions);
  return (permission: string) => set.has(permission);
}

interface PermissionsContextValue {
  can: (permission: string) => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | undefined>(
  undefined
);

export function PermissionsProvider({
  children,
  permissions,
}: {
  children: ReactNode;
  permissions: string[];
}) {
  const value = useMemo<PermissionsContextValue>(
    () => ({ can: buildCan(permissions) }),
    [permissions]
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return ctx;
}
