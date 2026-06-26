import { NextRequest, NextResponse } from "next/server";
import { globalSearch } from "@/app/_db/search";
import { getScopedLocationIds } from "@/app/_lib/util/location-scope";
import { getUserPermissions } from "@/app/_lib/rbac";
import { serializeForClient } from "@/app/_lib/util/serialize";

export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get("q") ?? "";

  const [scope, permissions] = await Promise.all([
    getScopedLocationIds(),
    getUserPermissions(),
  ]);

  const results = await globalSearch(scope, term, permissions);
  return NextResponse.json(serializeForClient(results));
}
