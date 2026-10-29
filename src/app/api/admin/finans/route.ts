import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/server/session-guard";
import { getFinancialReport } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  await getPersistentStoreData().catch(() => {});
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  const report = getFinancialReport({ startDate, endDate });
  return NextResponse.json(report);
}
