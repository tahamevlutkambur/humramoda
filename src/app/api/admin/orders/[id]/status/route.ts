import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { updateOrderOperationalStatus } from "@/lib/server/store";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const newStatus = body.status;

    if (newStatus !== "CONFIRMED" && newStatus !== "CANCELLED") {
      return NextResponse.json(
        { error: "Geçersiz sipariş operasyonel durumu. Yalnızca 'CONFIRMED' veya 'CANCELLED' kabul edilir." },
        { status: 400 }
      );
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const { order, error, idempotent } = updateOrderOperationalStatus(id, newStatus, {
      adminId: session.userId,
      adminEmail: session.email,
      ip: clientIp,
    });

    if (error || !order) {
      return NextResponse.json({ error: error || "Sipariş güncellenemedi." }, { status: 400 });
    }

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
