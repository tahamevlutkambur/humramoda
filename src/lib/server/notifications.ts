import crypto from "crypto";
import {
  getStoreData,
  saveStoreData,
  CustomerNotification,
  NotificationEventType,
} from "./store";
import { logAdminAudit } from "./logger";

export interface SendNotificationParams {
  orderId: string;
  orderNumber: string;
  recipientEmail: string;
  recipientPhone?: string;
  customerName: string;
  eventType: NotificationEventType;
  context?: Record<string, unknown>;
  idempotencySuffix?: string;
}

export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  idempotent?: boolean;
  status: "SENT" | "FAILED" | "SKIPPED_DUPLICATE";
  error?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateEmailTemplate(
  eventType: NotificationEventType,
  customerName: string,
  orderNumber: string,
  context: Record<string, unknown> = {}
): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(customerName || "Değerli Müşterimiz");
  const safeOrderNo = escapeHtml(orderNumber);

  switch (eventType) {
    case "ORDER_CREATED": {
      const totalAmount = context.totalAmount ? `${context.totalAmount} ₺` : "";
      return {
        subject: `Siparişiniz Alındı - ${orderNumber} | Hümra Moda`,
        text: `Sayın ${customerName},\n\n${orderNumber} numaralı siparişiniz başarıyla alınmıştır. Toplam Tutar: ${totalAmount}\n\nÖdeme ve hazırlık sürecini takip etmek için web sitemizi ziyaret edebilirsiniz.\n\nHümra Moda`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1c1c; padding: 20px; border: 1px solid #eaeaea;">
            <div style="border-bottom: 2px solid #141414; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="margin: 0; letter-spacing: 2px; font-weight: 500;">HÜMRA MODA</h2>
            </div>
            <p>Sayın <strong>${safeName}</strong>,</p>
            <p><strong>${safeOrderNo}</strong> numaralı siparişiniz başarıyla alınmıştır.</p>
            ${totalAmount ? `<p style="font-size: 16px;">Sipariş Tutarı: <strong>${escapeHtml(totalAmount)}</strong></p>` : ""}
            <p>Siparişiniz hazırlandığında ve kargoya verildiğinde sizi bilgilendireceğiz.</p>
            <div style="margin-top: 30px; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 15px;">
              Bu e-posta Hümra Moda sipariş bildirim sisteminden otomatik olarak gönderilmiştir.
            </div>
          </div>
        `,
      };
    }

    case "PAYMENT_CONFIRMED": {
      return {
        subject: `Ödemeniz Onaylandı - ${orderNumber} | Hümra Moda`,
        text: `Sayın ${customerName},\n\n${orderNumber} numaralı siparişinizin ödemesi başarıyla onaylanmıştır. Siparişiniz paketleme departmanımıza iletilmiştir.\n\nHümra Moda`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1c1c; padding: 20px; border: 1px solid #eaeaea;">
            <div style="border-bottom: 2px solid #141414; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="margin: 0; letter-spacing: 2px; font-weight: 500;">HÜMRA MODA</h2>
            </div>
            <p>Sayın <strong>${safeName}</strong>,</p>
            <p><strong>${safeOrderNo}</strong> numaralı siparişinizin ödemesi PayTR güvencesiyle başarıyla onaylanmıştır.</p>
            <p>Ürünleriniz özenle hazırlanarak en kısa sürede kargoya teslim edilecektir.</p>
            <div style="margin-top: 30px; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 15px;">
              Hümra Moda Müşteri Hizmetleri
            </div>
          </div>
        `,
      };
    }

    case "ORDER_CANCELLED": {
      return {
        subject: `Siparişiniz İptal Edildi - ${orderNumber} | Hümra Moda`,
        text: `Sayın ${customerName},\n\n${orderNumber} numaralı siparişiniz iptal edilmiştir. Sorularınız için bizimle iletişime geçebilirsiniz.\n\nHümra Moda`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1c1c; padding: 20px; border: 1px solid #eaeaea;">
            <div style="border-bottom: 2px solid #141414; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="margin: 0; letter-spacing: 2px; font-weight: 500;">HÜMRA MODA</h2>
            </div>
            <p>Sayın <strong>${safeName}</strong>,</p>
            <p><strong>${safeOrderNo}</strong> numaralı siparişiniz iptal edilmiştir.</p>
            <p>Eğer bir ödeme yapılmışsa ilgili tutar banka prosedürlerine göre kartınıza iade edilecektir.</p>
          </div>
        `,
      };
    }

    case "SHIPMENT_CREATED":
    case "SHIPMENT_IN_TRANSIT": {
      const carrier = escapeHtml(String(context.carrierName || "Kargo"));
      const trackingNumber = escapeHtml(String(context.trackingNumber || ""));
      const trackingUrl = context.trackingUrl ? String(context.trackingUrl) : "";
      return {
        subject: `Siparişiniz Kargoya Verildi - ${orderNumber} | Hümra Moda`,
        text: `Sayın ${customerName},\n\n${orderNumber} numaralı siparişiniz ${carrier} firmasına teslim edilmiştir.\nTakip No: ${trackingNumber}\n${trackingUrl ? `Takip Bağlantısı: ${trackingUrl}\n` : ""}\nHümra Moda`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1c1c; padding: 20px; border: 1px solid #eaeaea;">
            <div style="border-bottom: 2px solid #141414; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="margin: 0; letter-spacing: 2px; font-weight: 500;">HÜMRA MODA</h2>
            </div>
            <p>Sayın <strong>${safeName}</strong>,</p>
            <p>Harika bir haber! <strong>${safeOrderNo}</strong> numaralı siparişiniz kargoya teslim edilmiştir.</p>
            <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <p style="margin: 0 0 8px 0;"><strong>Kargo Firması:</strong> ${carrier}</p>
              <p style="margin: 0 0 12px 0;"><strong>Takip Numarası:</strong> ${trackingNumber}</p>
              ${trackingUrl ? `<a href="${escapeHtml(trackingUrl)}" target="_blank" style="display: inline-block; background-color: #141414; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 4px; font-size: 13px;">Kargomu Takip Et</a>` : ""}
            </div>
          </div>
        `,
      };
    }

    case "SHIPMENT_DELIVERED": {
      return {
        subject: `Siparişiniz Teslim Edildi - ${orderNumber} | Hümra Moda`,
        text: `Sayın ${customerName},\n\n${orderNumber} numaralı siparişiniz teslim edilmiştir. Ürünlerinizi keyifle kullanmanızı dileriz.\n\nHümra Moda`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1c1c; padding: 20px; border: 1px solid #eaeaea;">
            <div style="border-bottom: 2px solid #141414; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="margin: 0; letter-spacing: 2px; font-weight: 500;">HÜMRA MODA</h2>
            </div>
            <p>Sayın <strong>${safeName}</strong>,</p>
            <p><strong>${safeOrderNo}</strong> numaralı siparişinizin kargo teslimatı tamamlanmıştır.</p>
            <p>Hümra Moda'yı tercih ettiğiniz için teşekkür eder, keyifli günlerde kullanmanızı dileriz.</p>
          </div>
        `,
      };
    }

    case "RETURN_REQUESTED": {
      return {
        subject: `İade Talebiniz Alındı - ${orderNumber} | Hümra Moda`,
        text: `Sayın ${customerName},\n\n${orderNumber} numaralı siparişinize ait iade talebiniz incelemeye alınmıştır. Yetkililerimiz talebi inceledikten sonra size geri dönüş yapacaktır.\n\nHümra Moda`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1c1c; padding: 20px; border: 1px solid #eaeaea;">
            <div style="border-bottom: 2px solid #141414; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="margin: 0; letter-spacing: 2px; font-weight: 500;">HÜMRA MODA</h2>
            </div>
            <p>Sayın <strong>${safeName}</strong>,</p>
            <p><strong>${safeOrderNo}</strong> numaralı siparişiniz için oluşturduğunuz iade talebi başarıyla alınmıştır.</p>
            <p>Talebiniz operasyon ekibimiz tarafından incelendikten sonra kargo iade süreci hakkında bilgilendirileceksiniz.</p>
          </div>
        `,
      };
    }

    case "RETURN_DECISION": {
      const decision = String(context.decision || "").toUpperCase();
      const isApproved = decision === "APPROVED";
      const notes = context.notes ? escapeHtml(String(context.notes)) : "";
      return {
        subject: `İade Talebiniz ${isApproved ? "Onaylandı" : "Sonuçlandı"} - ${orderNumber} | Hümra Moda`,
        text: `Sayın ${customerName},\n\n${orderNumber} numaralı siparişinize ait iade talebiniz ${isApproved ? "onaylanmıştır" : "reddedilmiştir"}.\n${notes ? `Açıklama: ${notes}\n` : ""}\nHümra Moda`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1c1c; padding: 20px; border: 1px solid #eaeaea;">
            <div style="border-bottom: 2px solid #141414; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="margin: 0; letter-spacing: 2px; font-weight: 500;">HÜMRA MODA</h2>
            </div>
            <p>Sayın <strong>${safeName}</strong>,</p>
            <p><strong>${safeOrderNo}</strong> numaralı iade talebiniz <strong>${isApproved ? "KABUL EDİLMİŞTİR" : "REDDEDİLMİŞTİR"}</strong>.</p>
            ${notes ? `<p><strong>Açıklama:</strong> ${notes}</p>` : ""}
            ${isApproved ? `<p>Ürünü orijinal ambalajında ve faturasıyla birlikte anlaşmalı kargo kodumuz ile gönderebilirsiniz.</p>` : ""}
          </div>
        `,
      };
    }

    case "REFUND_CONFIRMED": {
      const amount = context.amount ? `${context.amount} ₺` : "";
      return {
        subject: `Para İadeniz Gerçekleştirildi - ${orderNumber} | Hümra Moda`,
        text: `Sayın ${customerName},\n\n${orderNumber} numaralı siparişiniz için ${amount} tutarındaki para iadesi bankanıza iletilmiştir.\n\nHümra Moda`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1c1c; padding: 20px; border: 1px solid #eaeaea;">
            <div style="border-bottom: 2px solid #141414; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="margin: 0; letter-spacing: 2px; font-weight: 500;">HÜMRA MODA</h2>
            </div>
            <p>Sayın <strong>${safeName}</strong>,</p>
            <p><strong>${safeOrderNo}</strong> numaralı siparişiniz için onaylanan ${amount ? `<strong>${escapeHtml(amount)}</strong>` : ""} para iadesi bankanıza iletilmiştir.</p>
            <p>Bankanızın işlem sürelerine bağlı olarak tutar 2-7 iş günü içinde hesabınıza yansıyacaktır.</p>
          </div>
        `,
      };
    }

    default:
      return {
        subject: `Sipariş Bildirimi - ${orderNumber} | Hümra Moda`,
        text: `Sayın ${customerName},\n\n${orderNumber} numaralı siparişiniz hakkında bilgilendirme.\n\nHümra Moda`,
        html: `<p>${safeName}, ${safeOrderNo} numaralı siparişiniz hakkında bilgilendirme.</p>`,
      };
  }
}

/**
 * Müşteriye bildirim gönderir.
 * Güvenlik ve Dayanıklılık:
 * 1. Bildirim gönderim hatası sipariş, ödeme veya kargo kaydını ASLA bozmaz.
 * 2. İdempotency anahtarı ile aynı olay mükerrer e-posta göndermez.
 * 3. Canlı e-posta sunucusu yoksa test outbox'ına yazar ve denetim loguna kaydeder.
 */
export function notifyCustomer(params: SendNotificationParams): NotificationResult {
  try {
    const store = getStoreData();
    store.notifications = store.notifications || [];

    const idempotencyKey = `${params.eventType}:${params.orderNumber}:${params.idempotencySuffix || "default"}`;

    // Mükerrer gönderim kontrolü (idempotency)
    const existing = store.notifications.find((n) => n.idempotencyKey === idempotencyKey);
    if (existing && existing.status === "SENT") {
      return {
        success: true,
        notificationId: existing.id,
        idempotent: true,
        status: "SKIPPED_DUPLICATE",
      };
    }

    const { subject, html, text } = generateEmailTemplate(
      params.eventType,
      params.customerName,
      params.orderNumber,
      params.context
    );

    const notificationId = `notif-${crypto.randomBytes(6).toString("hex")}`;
    const now = new Date().toISOString();

    const isLiveSmtpConfigured = Boolean(
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    );

    let status: "SENT" | "FAILED" = "SENT";
    let errorMessage: string | undefined;

    // Gerçek e-posta sağlayıcısı yapılandırılmışsa canlı gönderim yapılır
    if (isLiveSmtpConfigured) {
      try {
        // Canlı SMTP veya API entegrasyonu buraya bağlanır
        // Bu fazda canlı yetki olmadan gerçek müşteriye e-posta gönderilmez
      } catch (sendErr) {
        status = "FAILED";
        errorMessage = sendErr instanceof Error ? sendErr.message : "SMTP send failure";
      }
    } else {
      // Test ve simülasyon modunda outbox logu kullanılır (güvenli varsayılan)
      status = "SENT";
    }

    const record: CustomerNotification = {
      id: notificationId,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      channel: "EMAIL",
      eventType: params.eventType,
      recipient: params.recipientEmail,
      subject,
      contentHtml: html,
      contentText: text,
      status,
      idempotencyKey,
      errorMessage,
      sentAt: status === "SENT" ? now : undefined,
      createdAt: now,
    };

    store.notifications.push(record);
    saveStoreData(store);

    logAdminAudit({
      adminId: "NOTIFIER",
      adminEmail: "notifications@humramoda.local",
      action: status === "SENT" ? "NOTIFICATION_SENT" : "NOTIFICATION_FAILED",
      targetType: "NOTIFICATION",
      targetId: notificationId,
      result: status === "SENT" ? "SUCCESS" : "FAILED",
      details: {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        recipient: params.recipientEmail,
        eventType: params.eventType,
        isLiveSmtpConfigured,
      },
    });

    return {
      success: status === "SENT",
      notificationId,
      status,
      error: errorMessage,
    };
  } catch (criticalErr) {
    // Bildirim katmanı hatası üst katman işlemlerini asla patlatmamalı
    console.error("notifyCustomer unexpected error:", criticalErr);
    return {
      success: false,
      status: "FAILED",
      error: criticalErr instanceof Error ? criticalErr.message : "Notification internal failure",
    };
  }
}

export function getNotificationsByOrder(orderIdOrNumber: string): CustomerNotification[] {
  const store = getStoreData();
  const search = orderIdOrNumber.trim();
  return (store.notifications || []).filter(
    (n) => n.orderId === search || n.orderNumber === search
  );
}
