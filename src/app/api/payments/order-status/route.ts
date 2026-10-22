import { NextResponse } from "next/server";
import { getOrderPublicStatus } from "@/lib/server/store";

export async function GET(req: Request) {
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
