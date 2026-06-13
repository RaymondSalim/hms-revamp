import { NextRequest, NextResponse } from "next/server";
import { getFromS3 } from "@/app/_lib/s3";
import { checkPermission, type Permission } from "@/app/_lib/rbac";

// Only these key namespaces may be served, and each requires the matching
// permission. Anything else (or any path-traversal attempt) is rejected so a
// logged-in user cannot read arbitrary objects from the bucket.
const ALLOWED_PREFIXES: Array<{ prefix: string; permission: Permission }> = [
  { prefix: "booking-payments/", permission: "payments.view" },
  { prefix: "tenants/", permission: "tenants.view" },
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ s3Path?: string[] }> }
) {
  const { s3Path } = await params;
  const segments = s3Path ?? [];

  // Reject path traversal / empty keys before touching S3.
  if (segments.length === 0 || segments.some((s) => s === ".." || s === "." || s === "")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const key = segments.join("/");

  const match = ALLOWED_PREFIXES.find((p) => key.startsWith(p.prefix));
  if (!match) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { authorized } = await checkPermission(match.permission);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const response = await getFromS3(key);
    const body = await response.Body?.transformToByteArray();
    return new NextResponse(body ? Buffer.from(body) : null, {
      headers: { "Content-Type": response.ContentType || "application/octet-stream" },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
