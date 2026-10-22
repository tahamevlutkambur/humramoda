import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getAllOrders } from "@/lib/server/store";

export async function GET() {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const orders = getAllOrders();
  return NextResponse.json({ orders });
}
