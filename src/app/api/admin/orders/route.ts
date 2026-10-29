import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/server/session-guard";
import { getAllOrders } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";

export async function GET(req?: Request) {
  const auth = await requireAdminRole(req, ["ADMIN", "STAFF"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  await getPersistentStoreData().catch(() => {});
  const orders = getAllOrders();
  return NextResponse.json({ orders });
}
