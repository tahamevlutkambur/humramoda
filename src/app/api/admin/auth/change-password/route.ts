import { NextResponse } from "next/server";
import { getAuthenticatedAdmin, verifySameOrigin } from "@/lib/server/session-guard";
import { updateAdminPassword, getStoreData } from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";
import {
  createSessionToken,
  ADMIN_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/server/auth";

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim. Lütfen giriş yapınız." }, { status: 401 });
  }

  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Mevcut şifre ve yeni şifre alanları zorunludur." },
        { status: 400 }
      );
    }

    const result = updateAdminPassword(session.userId, currentPassword, newPassword);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Şifre güncellenemedi." }, { status: 400 });
    }

    await savePersistentStoreData(getStoreData()).catch(() => {});

    // Şifre güncellendiği için tokenVersionTimestamp değişti; güncel bir yeni token üretip cookie'ye yaz
    const newToken = createSessionToken({
      userId: session.userId,
      email: session.email,
      role: session.role,
      fullName: session.fullName,
    });

    const response = NextResponse.json({
      success: true,
      message: "Şifreniz başarıyla güncellendi. Diğer tüm cihazlardaki eski oturumlar geçersiz kılındı.",
    });

    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: newToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (err) {
    console.error("Change password API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
