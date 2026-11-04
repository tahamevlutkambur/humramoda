import { NextResponse } from "next/server";
import { getOrderPublicStatus, getStoreData } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import { verifyOrderTrackingToken } from "@/lib/server/shipping";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await getPersistentStoreData().catch(() => {});
  const { searchParams } = new URL(req.url);
  const orderNumber = searchParams.get("orderNumber");
  const orderId = searchParams.get("orderId");
  const accessToken = searchParams.get("accessToken");
  const identifier = (orderNumber || orderId || "").trim();

  if (!identifier) {
    return NextResponse.json({ error: "Sipariş numarası veya ID zorunludur." }, { status: 400 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sipariş doğrulaması gerekli." }, { status: 401 });
  }

  const store = getStoreData();
  const order = store.orders?.find(
    (candidate) =>
      candidate.orderNumber === identifier ||
      candidate.id === identifier
  );

  if (!order || !verifyOrderTrackingToken(accessToken, order.id)) {
    return NextResponse.json({ error: "Sipariş bulunamadı veya doğrulama süresi doldu." }, { status: 401 });
  }

  const status = getOrderPublicStatus(order.orderNumber);

  if (!status) {
    return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ success: true, order: status });
}
