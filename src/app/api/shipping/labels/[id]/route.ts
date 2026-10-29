import { NextResponse } from "next/server";
import { getStoreData } from "@/lib/server/store";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";

function escapeHtml(value: unknown): string {
  const str = String(value ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json(
      { error: "Yetkisiz erişim. Kargo gönderi belgesini görüntülemek için yönetici girişi gereklidir." },
      { status: 401 }
    );
  }

  const { id } = await params;
  const store = getStoreData();

  const shipment = (store.shipments || []).find((s) => s.id === id || s.trackingNumber === id);
  if (!shipment) {
    return new Response("Kargo gönderi belgesi bulunamadı.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const order = store.orders?.find((o) => o.id === shipment.orderId);

  const safeTrackingNumber = escapeHtml(shipment.trackingNumber);
  const safeCarrierName = escapeHtml(shipment.carrierName);
  const safeMethodLabel = shipment.method === "MANUAL" ? "MANUEL ETİKET" : "API ENTEGRE";
  const safeOrderNumber = escapeHtml(shipment.orderNumber);
  const safeDate = escapeHtml(new Date(shipment.createdAt).toLocaleDateString("tr-TR"));
  const safeCustomerName = escapeHtml(order ? order.customerFullName : "Alıcı");
  const safeFullAddress = order
    ? escapeHtml(
        `${order.shippingAddress.fullAddress}, ${order.shippingAddress.district} / ${order.shippingAddress.city}`
      )
    : "";
  const safeCustomerPhone = escapeHtml(order ? order.customerPhone : "");

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Kargo Gönderi Belgesi - ${safeTrackingNumber}</title>
  <style>
    body { font-family: monospace, sans-serif; margin: 20px; color: #111; }
    .label-box { border: 2px dashed #000; padding: 20px; max-width: 500px; margin: 0 auto; }
    .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; }
    .barcode { font-size: 28px; letter-spacing: 5px; text-align: center; border: 1px solid #ddd; padding: 10px; margin: 15px 0; background: #fafafa; font-weight: bold; }
    .section { margin-bottom: 12px; font-size: 13px; line-height: 1.4; }
    .strong { font-weight: bold; }
    @media print {
      body { margin: 0; }
      .label-box { border: 1px solid #000; }
    }
  </style>
</head>
<body>
  <div class="label-box">
    <div class="header">
      <div>
        <h2 style="margin: 0; font-size: 18px;">HÜMRA MODA</h2>
        <small>E-Ticaret Sevkiyat Etiketi</small>
      </div>
      <div style="text-align: right;">
        <span class="strong">${safeCarrierName}</span><br>
        <small>${safeMethodLabel}</small>
      </div>
    </div>

    <div class="barcode">
      |||| | ||||| || |||||| | ||||<br>
      <span style="font-size: 14px; letter-spacing: normal;">${safeTrackingNumber}</span>
    </div>

    <div class="section">
      <div class="strong">SİPARİŞ BİLGİSİ:</div>
      <div>Sipariş No: ${safeOrderNumber}</div>
      <div>Tarih: ${safeDate}</div>
    </div>

    <div class="section">
      <div class="strong">ALICI BİLGİLERİ:</div>
      <div>${safeCustomerName}</div>
      <div>${safeFullAddress}</div>
      <div>Tel: ${safeCustomerPhone}</div>
    </div>

    <div class="section">
      <div class="strong">GÖNDERİCİ:</div>
      <div>Hümra Moda Tekstil &amp; Tasarım Ltd. Şti.</div>
      <div>Merkez Mah. Moda Cad. No: 12 Kadıköy / İstanbul</div>
    </div>
  </div>
</body>
</html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store, private",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'none';",
    },
  });
}
