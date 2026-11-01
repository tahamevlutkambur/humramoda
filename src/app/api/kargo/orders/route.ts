import { NextResponse } from "next/server";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import { requireAdminRole } from "@/lib/server/session-guard";
import { checkDatabaseConnection } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const auth = await requireAdminRole(req, ["CARRIER", "ADMIN", "STAFF"]);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const store = await getPersistentStoreData();
    // GÜVENLİK & İŞ KURALI: Ödemesi tamamlanmamış (PENDING veya FAILED) siparişler
    // kargo görevlisine kesinlikle iletilmez. Yalnızca ödemesi onaylanmış siparişler listelenir.
    const paidOrders = (store.orders || []).filter(
      (o) => o.paymentStatus === "PAID" || o.operationalStatus === "CONFIRMED"
    );
    const orders = [...paidOrders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Kargo görevlilerinin ihtiyaç duyduğu net liste
    const cargoOrders = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      customerFullName: o.customerFullName,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      shippingAddress: {
        city: o.shippingAddress?.city || "",
        district: o.shippingAddress?.district || "",
        fullAddress: o.shippingAddress?.fullAddress || "",
      },
      customerNotes: o.customerNotes || "",
      operationalStatus: o.operationalStatus,
      paymentStatus: o.paymentStatus,
      paymentProvider: o.paymentProvider || "PAYTR",
      totalAmount: o.totalAmount,
      shippingStatus: o.shippingStatus || "AWAITING_SHIPMENT",
      carrier: o.carrier || "YURTICI",
      carrierName: o.carrierName || "Yurtiçi Kargo",
      trackingNumber: o.trackingNumber || null,
      trackingUrl: o.trackingUrl || null,
      shippedAt: o.shippedAt || null,
      deliveredAt: o.deliveredAt || null,
      items: (o.items || []).map((it) => ({
        id: it.id,
        productId: it.productId,
        productName: it.productName,
        colorName: it.colorName,
        sizeName: it.sizeName,
        quantity: it.quantity,
        sku: it.sku,
      })),
      trackingEvents: (o.trackingEvents || []).map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        status: e.status,
        description: e.description,
        location: e.location,
      })),
    }));

    return NextResponse.json({
      success: true,
      orders: cargoOrders,
      user: {
        email: auth.session.email,
        role: auth.session.role,
        fullName: auth.session.fullName,
      },
      db: await checkDatabaseConnection(),
    });
  } catch (err) {
    console.error("Kargo orders list error:", err);
    return NextResponse.json(
      { error: "Siparişler yüklenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}
