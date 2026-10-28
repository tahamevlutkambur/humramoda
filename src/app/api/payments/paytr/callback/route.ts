import { processPayTRCallback } from "@/lib/server/paytr";
import { getStoreData } from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

/**
 * PayTR 2. Adım: Sunucu-Sunucu Callback Webhook Uç Noktası
 *
 * KRİTİK PAYTR GEREKSİNİMLERİ:
 * 1. İşlem başarılı olduğunda veya idempotent olarak tekrarlandığında
 *    yalnızca ve yalnızca saf metin "OK" yanıtı dönmelidir (HTML veya JSON basılmamalıdır).
 * 2. Hash uyuşmazlığı durumunda 400 durum kodu ile hata metni dönülür.
 * 3. CSRF veya kullanıcı oturumundan bağımsız olarak sunucudan sunucuya çalışır.
 */
export async function POST(req: Request) {
  try {
    await getPersistentStoreData().catch(() => {});
    const forwardedFor = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";

    const contentType = req.headers.get("content-type") || "";
    let merchantOid = "";
    let status = "";
    let totalAmount = "";
    let hash = "";
    let failedReasonCode = "";
    let failedReasonMsg = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      merchantOid = String(formData.get("merchant_oid") || "");
      status = String(formData.get("status") || "");
      totalAmount = String(formData.get("total_amount") || "");
      hash = String(formData.get("hash") || "");
      failedReasonCode = String(formData.get("failed_reason_code") || "");
      failedReasonMsg = String(formData.get("failed_reason_msg") || "");
    } else {
      // JSON formatında da kabul et (entegrasyon testleri ve simülatör için)
      const json = await req.json();
      merchantOid = String(json.merchant_oid || "");
      status = String(json.status || "");
      totalAmount = String(json.total_amount || "");
      hash = String(json.hash || "");
      failedReasonCode = String(json.failed_reason_code || "");
      failedReasonMsg = String(json.failed_reason_msg || "");
    }

    if (!merchantOid || !status || !totalAmount || !hash) {
      return new Response("PAYTR notification failed: missing required fields", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const result = processPayTRCallback(
      {
        merchantOid,
        status,
        totalAmount,
        hash,
        failedReasonCode,
        failedReasonMsg,
      },
      clientIp
    );

    if (result.ok) {
      await savePersistentStoreData(getStoreData()).catch(() => {});
    }

    return new Response(result.statusText, {
      status: result.httpStatus,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("PayTR callback error:", err);
    return new Response("PAYTR notification failed: internal server error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
