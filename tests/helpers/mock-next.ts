import { vi } from "vitest";

// Mock next/cache (revalidatePath is used in server actions)
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Mock next/headers (cookies used in server components)
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

// Mock S3 utilities (not needed in integration tests)
vi.mock("@/app/_lib/s3", () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  deleteFromS3: vi.fn().mockResolvedValue(undefined),
}));

// Mock RBAC (always authorize in integration tests)
vi.mock("@/app/_lib/rbac", () => ({
  checkPermission: vi.fn().mockResolvedValue({ authorized: true, permissions: new Set() }),
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  requirePermission: vi.fn().mockResolvedValue(undefined),
}));
