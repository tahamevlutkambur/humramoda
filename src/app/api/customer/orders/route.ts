import { NextResponse } from "next/server";
import { getAuthenticatedCustomer } from "@/lib/server/customer-auth";
import { getCustomerOrders } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return NextResponse.json(
        { error: "Bu işlem için giriş yapmanız gerekmektedir." },
        { status: 401 }
      );
    }

    const orders = getCustomerOrders(customer.id);

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        totalAmount: o.totalAmount,
        operationalStatus: o.operationalStatus,
        paymentStatus: o.paymentStatus,
        paymentProvider: o.paymentProvider,
        shippingStatus: o.shippingStatus,
        carrierName: o.carrierName,
        trackingNumber: o.trackingNumber,
        trackingUrl: o.trackingUrl,
        itemsCount: o.items.reduce((acc, it) => acc + it.quantity, 0),
        items: o.items,
        shippingAddress: o.shippingAddress,
      })),
    });
  } catch (err) {
    console.error("Customer orders GET API error:", err);
    return NextResponse.json(
      { error: "Siparişler listelenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

