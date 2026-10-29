import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/server/session-guard";
import { getPersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireAdminRole(req, ["ADMIN", "STAFF"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const store = await getPersistentStoreData();
  // GÜVENLİK & İŞ KURALI: Yalnızca ödemesi PayTR ile başarıyla tamamlanmış (PAID), iade edilmiş
  // veya operasyonel olarak onaylanmış gerçek siparişler listelenir.
  // Müşterinin sepet/ödeme adımında bıraktığı, ödemesi tamamlanmamış taslak oturumlar (PENDING)
  // kesinlikle sipariş ve kargo listelerine düşmez.
  const validOrders = (store.orders || []).filter(
    (o) => o.paymentStatus === "PAID" || o.paymentStatus === "REFUNDED" || o.operationalStatus === "CONFIRMED"
  );
  const orders = [...validOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return NextResponse.json({ orders });
}
