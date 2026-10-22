import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import {
  updateReturnRequestStatus,
  ReturnStatus,
  ReturnRestockDecision,
} from "@/lib/server/returns";

export async function PUT(
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
    const newStatus = body.status as ReturnStatus;
    const adminNotes = body.adminNotes;
    const restockDecision = body.restockDecision as ReturnRestockDecision | undefined;
    const actualRefundVerified = body.actualRefundVerified === true;
    const refundTransactionRef = body.refundTransactionRef?.trim();

    if (!newStatus) {
      return NextResponse.json({ error: "Yeni iade durumu belirtilmelidir." }, { status: 400 });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const result = updateReturnRequestStatus({
      returnId: id,
      newStatus,
      adminNotes,
      restockDecision,
      actualRefundVerified,
      refundTransactionRef,
      adminInfo: {
        adminId: session.userId,
        adminEmail: session.email,
        ip: clientIp,
      },
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      returnRequest: result.returnRequest,
      message: "İade talebi başarıyla güncellendi.",
    });
  } catch (err) {
    console.error("Admin update return request API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
