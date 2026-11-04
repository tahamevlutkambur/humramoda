import { NextResponse } from "next/server";
import { getAuthenticatedCustomer } from "@/lib/server/customer-auth";
import { getCustomerOrderById } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return NextResponse.json(
        { error: "Bu işlem için giriş yapmanız gerekmektedir." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const order = getCustomerOrderById(customer.id, id);

    if (!order) {
      return NextResponse.json(
        { error: "Sipariş bulunamadı veya bu siparişe erişim yetkiniz yok." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        totalAmount: order.totalAmount,
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        shippingAmount: order.shippingAmount,
        operationalStatus: order.operationalStatus,
        paymentStatus: order.paymentStatus,
        paymentProvider: order.paymentProvider,
        shippingStatus: order.shippingStatus,
        carrierName: order.carrierName,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        items: order.items,
        shippingAddress: order.shippingAddress,
        customerNotes: order.customerNotes,
      },
    });
  } catch (err) {
    console.error("Customer order detail GET API error:", err);
    return NextResponse.json(
      { error: "Sipariş detayı yüklenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

