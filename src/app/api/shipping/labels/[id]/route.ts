import { getStoreData } from "@/lib/server/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const store = getStoreData();

  const shipment = (store.shipments || []).find((s) => s.id === id || s.trackingNumber === id);
  if (!shipment) {
    return new Response("Kargo gönderi belgesi bulunamadı.", { status: 404 });
  }

  const order = store.orders?.find((o) => o.id === shipment.orderId);

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Kargo Gönderi Belgesi - ${shipment.trackingNumber}</title>
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
<body onload="window.print()">
  <div class="label-box">
    <div class="header">
      <div>
        <h2 style="margin: 0; font-size: 18px;">HÜMRA MODA</h2>
        <small>E-Ticaret Sevkiyat Etiketi</small>
      </div>
      <div style="text-align: right;">
        <span class="strong">${shipment.carrierName}</span><br>
        <small>${shipment.method === "MANUAL" ? "MANUEL ETİKET" : "API ENTEGRE"}</small>
      </div>
    </div>

    <div class="barcode">
      |||| | ||||| || |||||| | ||||<br>
      <span style="font-size: 14px; letter-spacing: normal;">${shipment.trackingNumber}</span>
    </div>

    <div class="section">
      <div class="strong">SİPARİŞ BİLGİSİ:</div>
      <div>Sipariş No: ${shipment.orderNumber}</div>
      <div>Tarih: ${new Date(shipment.createdAt).toLocaleDateString("tr-TR")}</div>
    </div>

    <div class="section">
      <div class="strong">ALICI BİLGİLERİ:</div>
      <div>${order ? order.customerFullName : "Alıcı"}</div>
      <div>${order ? `${order.shippingAddress.fullAddress}, ${order.shippingAddress.district} / ${order.shippingAddress.city}` : ""}</div>
      <div>Tel: ${order ? order.customerPhone : ""}</div>
    </div>

    <div class="section">
      <div class="strong">GÖNDERİCİ:</div>
      <div>Hümra Moda Tekstil & Tasarım Ltd. Şti.</div>
      <div>Merkez Mah. Moda Cad. No: 12 Kadıköy / İstanbul</div>
    </div>
  </div>
</body>
</html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
