import { NextRequest, NextResponse } from "next/server";
import { getGroupedIncomeExpense } from "@/app/_db/dashboard";
import { serializeForClient } from "@/app/_lib/util/serialize";

export async function GET(request: NextRequest) {
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
