import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/_lib/auth";
import { getFromS3 } from "@/app/_lib/s3";

export async function GET(request: NextRequest, { params }: { params: Promise<{ s3Path?: string[] }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { s3Path } = await params;
  const key = s3Path?.join("/") || "";
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
