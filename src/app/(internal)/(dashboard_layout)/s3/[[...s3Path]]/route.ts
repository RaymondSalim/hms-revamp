import { NextRequest, NextResponse } from "next/server";
import { getFromS3 } from "@/app/_lib/s3";
import { checkPermission, type Permission } from "@/app/_lib/rbac";
import { prisma } from "@/app/_lib/prisma";
import { getScopedLocationIds, isLocationInScope } from "@/app/_lib/util/location-scope";

// Only these key namespaces may be served, and each requires the matching
// permission. Anything else (or any path-traversal attempt) is rejected so a
// logged-in user cannot read arbitrary objects from the bucket.
const ALLOWED_PREFIXES: Array<{ prefix: string; permission: Permission }> = [
  { prefix: "booking-payments/", permission: "payments.view" },
  { prefix: "tenants/", permission: "tenants.view" },
];

// Content types we are willing to serve inline. Anything else (notably HTML/SVG,
// which can execute script on our origin) is forced to download as an opaque
// binary so a malicious upload cannot become stored XSS.
const INLINE_SAFE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

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

  // Location-scope guard for payment proofs. The key is
  // booking-payments/{booking_id}/{timestamp}/{filename}, so resolve the owning
  // booking's location and reject when the caller is scoped out of it. Without
  // this a scoped user could read other properties' payment proofs by guessing
  // the predictable key. (Tenant documents are global in this data model, like
  // the rest of the tenant surface, so they are not location-scoped here.)
  if (match.prefix === "booking-payments/") {
    const bookingId = Number(segments[1]);
    if (!Number.isInteger(bookingId)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { rooms: { select: { location_id: true } } },
    });
    const locationId = booking?.rooms?.location_id ?? null;
    const scope = await getScopedLocationIds();
    if (locationId == null || !isLocationInScope(scope, locationId)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  }

  try {
    const response = await getFromS3(key);
    const body = await response.Body?.transformToByteArray();

    const storedType = response.ContentType || "application/octet-stream";
    const safeInline = INLINE_SAFE_TYPES.has(storedType.toLowerCase());
    const headers: Record<string, string> = {
      "Content-Type": safeInline ? storedType : "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    };
    if (!safeInline) {
      headers["Content-Disposition"] = "attachment";
    }

    return new NextResponse(body ? Buffer.from(body) : null, { headers });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
