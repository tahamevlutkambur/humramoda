import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/server/session-guard";
import { getAdminAuditLogs } from "@/lib/server/logger";
import { getPersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  await getPersistentStoreData().catch(() => {});

  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || undefined;
    const adminEmail = searchParams.get("adminEmail") || undefined;
    const ipAddress = searchParams.get("ipAddress") || undefined;
    const result = (searchParams.get("result") as "SUCCESS" | "FAILED") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);

    const data = getAdminAuditLogs({
      action,
      adminEmail,
      ipAddress,
      result,
      startDate,
      endDate,
      page,
      limit,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("Audit log error:", err);
    return NextResponse.json({
      logs: [],
      total: 0,
      page: 1,
      totalPages: 1,
      limit: 25,
    });
  }
}
