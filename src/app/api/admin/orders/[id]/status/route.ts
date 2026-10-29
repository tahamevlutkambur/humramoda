import { NextResponse } from "next/server";
import { getAuthenticatedAdmin, verifySameOrigin } from "@/lib/server/session-guard";
import { updateOrderOperationalStatus, getStoreData } from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";
import { getClientIp } from "@/lib/server/auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const { id } = await params;

  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const newStatus = body.status;

    if (newStatus !== "CONFIRMED" && newStatus !== "CANCELLED") {
      return NextResponse.json(
        { error: "Geçersiz sipariş operasyonel durumu. Yalnızca 'CONFIRMED' veya 'CANCELLED' kabul edilir." },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(req);

    const { order, error, idempotent } = updateOrderOperationalStatus(id, newStatus, {
      adminId: session.userId,
      adminEmail: session.email,
      ip: clientIp,
    });

    if (error || !order) {
      return NextResponse.json({ error: error || "Sipariş güncellenemedi." }, { status: 400 });
    }

    await savePersistentStoreData(getStoreData()).catch(() => {});

    return NextResponse.json({
      success: true,
      order,
      idempotent,
      message:
        newStatus === "CONFIRMED"
          ? "Sipariş başarıyla onaylandı ve stok düşümü işlendi."
          : "Sipariş başarıyla iptal edildi ve düşülmüş stoklar iade edildi.",
    });
  } catch (err) {
    console.error("Order status update API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
