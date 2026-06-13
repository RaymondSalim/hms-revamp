import { NextRequest, NextResponse } from "next/server";
import { getGroupedIncomeExpense } from "@/app/_db/dashboard";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { checkPermission } from "@/app/_lib/rbac";

export async function GET(request: NextRequest) {
  const { authorized } = await checkPermission("financials.view");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const locationId = parseInt(searchParams.get("locationId") ?? "1", 10);
  const startDate = new Date(searchParams.get("startDate") ?? new Date().toISOString());
  const endDate = new Date(searchParams.get("endDate") ?? new Date().toISOString());
  const splitDeposit = searchParams.get("splitDeposit") === "true";

  const result = await getGroupedIncomeExpense({
    locationId,
    startDate,
    endDate,
    splitDeposit,
  });

  return NextResponse.json(serializeForClient(result));
}
