import { NextResponse } from "next/server";
import { logSiteActivity, SiteActivityType } from "@/lib/server/logger";

const ALLOWED_SITE_EVENTS = new Set<SiteActivityType>([
  "PAGE_VIEW",
  "SEARCH_QUERY",
  "CATEGORY_FILTER",
  "PRODUCT_VIEW",
  "COLOR_SELECT",
  "SIZE_SELECT",
  "ADD_TO_CART",
  "CART_ERROR",
]);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const eventType = body.eventType as SiteActivityType;

    if (!eventType || !ALLOWED_SITE_EVENTS.has(eventType)) {
      return NextResponse.json({ error: "Geçersiz olay türü." }, { status: 400 });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || undefined;

    logSiteActivity({
      eventType,
      path: typeof body.path === "string" ? body.path.slice(0, 150) : "/",
      query: typeof body.query === "string" ? body.query.slice(0, 100) : undefined,
      sessionId: typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : undefined,
      userId: typeof body.userId === "string" ? body.userId.slice(0, 64) : undefined,
      details: typeof body.details === "object" ? body.details : undefined,
      ipAddress: clientIp,
      userAgent,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Site activity ingest error:", err);
    return NextResponse.json({ error: "İşlenemedi." }, { status: 500 });
  }
}
