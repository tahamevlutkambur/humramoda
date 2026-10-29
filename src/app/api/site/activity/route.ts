import { NextResponse } from "next/server";
import { logSiteActivity, SiteActivityType } from "@/lib/server/logger";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";
import { getStoreData } from "@/lib/server/store";

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
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const eventType = body.eventType as SiteActivityType;

    if (!eventType || !ALLOWED_SITE_EVENTS.has(eventType)) {
      return NextResponse.json({ error: "Geçersiz olay türü." }, { status: 400 });
    }

    const clientIp = (req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
    const userAgent = req.headers.get("user-agent") || undefined;

    const log = logSiteActivity({
      eventType,
      path: typeof body.path === "string" ? body.path.slice(0, 150) : "/",
      query: typeof body.query === "string" ? body.query.slice(0, 100) : undefined,
      sessionId: typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : undefined,
      userId: typeof body.userId === "string" ? body.userId.slice(0, 64) : undefined,
      details: typeof body.details === "object" ? body.details : undefined,
      ipAddress: clientIp,
      userAgent,
    });
    const store = getStoreData();
    store.siteActivityLogs = store.siteActivityLogs || [];
    store.siteActivityLogs.unshift(log);
    store.siteActivityLogs = store.siteActivityLogs.slice(0, 5000);
    await savePersistentStoreData(store);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Site activity ingest error:", err);
    return NextResponse.json({ error: "İşlenemedi." }, { status: 500 });
  }
}
