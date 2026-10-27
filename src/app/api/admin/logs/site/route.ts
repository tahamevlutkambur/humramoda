import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getSiteActivityLogs } from "@/lib/server/logger";

export async function GET(req: Request) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const eventType = searchParams.get("eventType") || undefined;
    const path = searchParams.get("path") || undefined;
    const ipAddress = searchParams.get("ipAddress") || undefined;
    const searchQuery = searchParams.get("searchQuery") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);

    const data = getSiteActivityLogs({
      eventType,
      path,
      ipAddress,
      searchQuery,
      startDate,
      endDate,
      page,
      limit,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("Site log error:", err);
    return NextResponse.json({
      logs: [],
      total: 0,
      page: 1,
      totalPages: 1,
      limit: 25,
    });
  }
}
