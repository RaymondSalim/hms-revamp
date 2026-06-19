import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    version: process.env.VERSION || "0.0.0",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
