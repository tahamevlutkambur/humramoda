import { NextResponse } from "next/server";
import crypto from "crypto";
import { getStoreData, saveStoreData } from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";
import { requireAdminRole, verifySameOrigin } from "@/lib/server/session-guard";
import { logAdminAudit } from "@/lib/server/logger";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getPersistentStoreData().catch(() => {});
    const csrf = verifySameOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ error: csrf.error }, { status: 403 });
    }

    const auth = await requireAdminRole(req, ["CARRIER", "ADMIN", "STAFF"]);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { id } = await params;
    const body = await req.json();
    const { action, status, trackingNumber } = body;

    const targetStatus = action === "SHIP" || status === "SHIPPED"
      ? "SHIPPED"
      : action === "DELIVER" || status === "DELIVERED"
      ? "DELIVERED"
      : null;

    if (!targetStatus) {
      return NextResponse.json(
        { error: "Geçersiz işlem. 'SHIPPED' veya 'DELIVERED' belirtilmelidir." },
        { status: 400 }
      );
    }

    await getPersistentStoreData().catch(() => {});
    const store = getStoreData();
    const order = store.orders?.find((o) => o.id === id || o.orderNumber === id);

    if (!order) {
      return NextResponse.json(
        { error: "Sipariş sistemde bulunamadı." },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    order.trackingEvents = order.trackingEvents || [];

    if (targetStatus === "SHIPPED") {
      order.shippingStatus = "SHIPPED";
      order.shippedAt = now;
      if (trackingNumber && typeof trackingNumber === "string" && trackingNumber.trim()) {
        order.trackingNumber = trackingNumber.trim();
      } else if (!order.trackingNumber) {
        order.trackingNumber = `TRK-${Date.now().toString().slice(-8)}`;
      }

      order.trackingEvents.push({
        id: `evt-${crypto.randomBytes(6).toString("hex")}`,
        timestamp: now,
        status: "SHIPPED",
        description: "Ürün kargoya verildi. Dağıtım merkezine ulaştırılmak üzere yola çıktı.",
        location: "Kargo Aktarma Merkezi",
        createdAt: now,
      });
    } else if (targetStatus === "DELIVERED") {
      order.shippingStatus = "DELIVERED";
      order.deliveredAt = now;

      order.trackingEvents.push({
        id: `evt-${crypto.randomBytes(6).toString("hex")}`,
        timestamp: now,
        status: "DELIVERED",
        description: "Ürün alıcıya başarıyla teslim edildi.",
        location: `${order.shippingAddress?.district || ""}, ${order.shippingAddress?.city || ""}`.trim(),
        createdAt: now,
      });
    }

    order.updatedAt = now;

    // Hem bellek deposuna hem kalıcı PostgreSQL deposuna hemen yaz
    saveStoreData(store);
    await savePersistentStoreData(store).catch((err) => {
      console.warn("Persistent save failed in cargo route:", err);
    });

    // Denetim kaydı
    logAdminAudit({
      adminId: auth.session.userId,
      adminEmail: auth.session.email,
      action: "SHIPPING_TRACKING_UPDATED",
      targetType: "SHIPPING",
      targetId: order.orderNumber,
      result: "SUCCESS",
      details: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        newStatus: targetStatus,
        trackingNumber: order.trackingNumber,
      },
    });

    return NextResponse.json({
      success: true,
      message: targetStatus === "SHIPPED" ? "Sipariş kargoya verildi olarak güncellendi." : "Sipariş teslim edildi olarak işaretlendi.",
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        shippingStatus: order.shippingStatus,
        trackingNumber: order.trackingNumber,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
      },
    });
  } catch (err) {
    console.error("Kargo status update error:", err);
    return NextResponse.json(
      { error: "Kargo durumu güncellenirken hata oluştu." },
      { status: 500 }
    );
  }
}
