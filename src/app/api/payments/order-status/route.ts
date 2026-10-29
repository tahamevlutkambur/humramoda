import { NextResponse } from "next/server";
import { getOrderPublicStatus } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await getPersistentStoreData().catch(() => {});
  const { searchParams } = new URL(req.url);
  const orderNumber = searchParams.get("orderNumber");

  if (!orderNumber || !orderNumber.trim()) {
    return NextResponse.json({ error: "Sipariş numarası zorunludur." }, { status: 400 });
  }

  const status = getOrderPublicStatus(orderNumber);

  if (!status) {
    return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ success: true, order: status });
}
