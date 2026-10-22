import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getStoreData, AppStoreData, StoreOrder } from "./store";
import { logAdminAudit } from "./logger";

export type BackupType = "MANUAL" | "AUTO" | "SAFETY";

export interface BackupManifest {
  id: string;
  createdAt: string; // UTC ISO 8601
  type: BackupType;
  description?: string;
  version: string;
  sha256Checksum: string;
  sizeBytes: number;
  itemCounts: {
    products: number;
    categories: number;
    collections: number;
    orders: number;
    campaigns: number;
    admins: number;
    shipments?: number;
    returns?: number;
  };
  isValid: boolean;
  fileName: string;
}

export interface BackupFileContent {
  manifest: Omit<BackupManifest, "sha256Checksum" | "sizeBytes" | "isValid">;
  data: AppStoreData;
}

const DATA_DIR = path.join(process.cwd(), "data");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const STORE_FILE = path.join(DATA_DIR, "store.json");

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

/**
 * SHA-256 özeti hesaplar.
 */
function computeSha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Yeni bir yedek oluşturur (MANUAL, AUTO veya SAFETY).
 */
export function createBackup(
  type: BackupType = "MANUAL",
  description?: string,
  adminInfo?: { adminId: string; adminEmail: string; ip?: string }
): { manifest?: BackupManifest; error?: string } {
  ensureBackupsDir();

  try {
    const storeData = getStoreData();
    const timestamp = new Date().toISOString();
    const cleanDateStr = timestamp.replace(/[:.]/g, "-");
    const id = `backup-${type.toLowerCase()}-${cleanDateStr}`;
    const fileName = `${id}.json`;
    const filePath = path.join(BACKUPS_DIR, fileName);

    const payload: BackupFileContent = {
      manifest: {
        id,
        createdAt: timestamp,
        type,
        description: description || (type === "SAFETY" ? "Geri yükleme öncesi otomatik güvenlik yedeği" : "Manuel sistem yedeği"),
        version: "1.0",
        itemCounts: {
          products: storeData.products?.length || 0,
          categories: storeData.categories?.length || 0,
          collections: storeData.collections?.length || 0,
          orders: storeData.orders?.length || 0,
          campaigns: storeData.campaigns?.length || 0,
          admins: storeData.adminUsers?.length || 0,
          shipments: storeData.shipments?.length || 0,
          returns: storeData.returnRequests?.length || 0,
        },
        fileName,
      },
      data: storeData,
    };

    const serializedData = JSON.stringify(payload.data);
    const checksum = computeSha256(serializedData);

    const finalFileContent = {
      ...payload,
      checksum,
    };

    const finalRaw = JSON.stringify(finalFileContent, null, 2);
    fs.writeFileSync(filePath, finalRaw, "utf-8");

    const stats = fs.statSync(filePath);

    const manifest: BackupManifest = {
      id,
      createdAt: timestamp,
      type,
      description: payload.manifest.description,
      version: "1.0",
      sha256Checksum: checksum,
      sizeBytes: stats.size,
      itemCounts: payload.manifest.itemCounts,
      isValid: true,
      fileName,
    };

    if (adminInfo) {
      logAdminAudit({
        adminId: adminInfo.adminId,
        adminEmail: adminInfo.adminEmail,
        action: "BACKUP_CREATED",
        targetType: "BACKUP",
        targetId: id,
        result: "SUCCESS",
        ipAddress: adminInfo.ip,
        details: {
          type,
          description: payload.manifest.description,
          sizeBytes: stats.size,
          itemCounts: payload.manifest.itemCounts,
        },
      });
    }

    return { manifest };
  } catch (err: unknown) {
    console.error("Backup creation error:", err);
    return { error: err instanceof Error ? err.message : "Yedek oluşturulamadı." };
  }
}

/**
 * Mevcut tüm yedekleri listeler ve doğruluk durumlarını denetler.
 */
export function listBackups(): BackupManifest[] {
  ensureBackupsDir();

  try {
    const files = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith(".json"));
    const manifests: BackupManifest[] = [];
    const seenIds = new Set<string>();

    for (const file of files) {
      const fullPath = path.join(BACKUPS_DIR, file);
      const fileBaseName = path.basename(file, ".json");
      if (seenIds.has(fileBaseName)) continue;
      seenIds.add(fileBaseName);

      try {
        const stats = fs.statSync(fullPath);
        const raw = fs.readFileSync(fullPath, "utf-8");
        const parsed = JSON.parse(raw);

        const storedChecksum = parsed.checksum;
        const serializedData = JSON.stringify(parsed.data || {});
        const computed = computeSha256(serializedData);
        const isValid = storedChecksum === computed && !!parsed.data?.products;

        manifests.push({
          id: fileBaseName,
          createdAt: parsed.manifest?.createdAt || stats.mtime.toISOString(),
          type: parsed.manifest?.type || "MANUAL",
          description: parsed.manifest?.description || "Açıklama belirtilmedi",
          version: parsed.manifest?.version || "1.0",
          sha256Checksum: storedChecksum || computed,
          sizeBytes: stats.size,
          itemCounts: parsed.manifest?.itemCounts || {
            products: parsed.data?.products?.length || 0,
            categories: parsed.data?.categories?.length || 0,
            collections: parsed.data?.collections?.length || 0,
            orders: parsed.data?.orders?.length || 0,
            campaigns: parsed.data?.campaigns?.length || 0,
            admins: parsed.data?.adminUsers?.length || 0,
          },
          isValid,
          fileName: file,
        });
      } catch {
        manifests.push({
          id: fileBaseName,
          createdAt: new Date().toISOString(),
          type: "MANUAL",
          description: "Bozuk veya okunamayan yedek dosyası",
          version: "Bilinmiyor",
          sha256Checksum: "GEÇERSİZ",
          sizeBytes: 0,
          itemCounts: { products: 0, categories: 0, collections: 0, orders: 0, campaigns: 0, admins: 0 },
          isValid: false,
          fileName: file,
        });
      }
    }

    return manifests.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (err) {
    console.error("List backups error:", err);
    return [];
  }
}

/**
 * Belirli bir yedeğin bütünlüğünü doğrular.
 */
export function verifyBackupById(backupId: string): {
  isValid: boolean;
  valid: boolean;
  manifest?: BackupManifest;
  error?: string;
  storedChecksum?: string;
  calculatedChecksum?: string;
} {
  ensureBackupsDir();
  const safeId = path.basename(backupId).replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(BACKUPS_DIR, `${safeId}.json`);

  if (!fs.existsSync(filePath)) {
    return { isValid: false, valid: false, error: "Yedek dosyası bulunamadı." };
  }

  try {
    const stats = fs.statSync(filePath);
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);

    const storedChecksum = parsed.checksum;
    const serializedData = JSON.stringify(parsed.data || {});
    const computed = computeSha256(serializedData);

    if (storedChecksum !== computed) {
      return {
        isValid: false,
        valid: false,
        storedChecksum,
        calculatedChecksum: computed,
        error: `Bütünlük hatası: SHA-256 sağlama toplamı uyuşmuyor. Dosya bozulmuş veya haricen değiştirilmiş. (Hesaplanan: ${computed.slice(0, 10)}..., Beklenen: ${storedChecksum?.slice(0, 10)}...)`,
      };
    }

    if (!parsed.data || !Array.isArray(parsed.data.products) || !Array.isArray(parsed.data.categories)) {
      return { isValid: false, valid: false, error: "Geçersiz yedek şeması: Temel veri koleksiyonları eksik." };
    }

    const manifest: BackupManifest = {
      id: parsed.manifest?.id || safeId,
      createdAt: parsed.manifest?.createdAt || stats.mtime.toISOString(),
      type: parsed.manifest?.type || "MANUAL",
      description: parsed.manifest?.description,
      version: parsed.manifest?.version || "1.0",
      sha256Checksum: computed,
      sizeBytes: stats.size,
      itemCounts: parsed.manifest?.itemCounts,
      isValid: true,
      fileName: `${safeId}.json`,
    };

    return { isValid: true, valid: true, manifest, storedChecksum, calculatedChecksum: computed };
  } catch (err: unknown) {
    return { isValid: false, valid: false, error: err instanceof Error ? err.message : "Yedek doğrulanamadı." };
  }
}

/**
 * Yedeği güvenli bir şekilde geri yükler.
 * Adımlar:
 * 1. Bütünlük kontrolü
 * 2. Otomatik güvenlik yedeği (SAFETY) alma
 * 3. Sipariş koruması (Yedekten sonra oluşan yeni siparişlerin korunması)
 * 4. Atomik veri güncelleme
 * 5. Denetim loguna yazma
 */
export function restoreBackupById(
  backupId: string,
  adminInfo: { adminId: string; adminEmail: string; ip?: string },
  preserveNewerOrders: boolean = true
): { success: boolean; safetyBackupId?: string; error?: string } {
  // 1. Doğrulama
  const check = verifyBackupById(backupId);
  if (!check.isValid || !check.manifest) {
    logAdminAudit({
      adminId: adminInfo.adminId,
      adminEmail: adminInfo.adminEmail,
      action: "BACKUP_RESTORE_FAILED",
      targetType: "BACKUP",
      targetId: backupId,
      result: "FAILED",
      ipAddress: adminInfo.ip,
      details: { reason: check.error || "Bütünlük doğrulaması başarısız." },
    });
    return { success: false, error: check.error || "Bozuk veya geçersiz yedek geri yüklenemez." };
  }

  const safeId = path.basename(backupId).replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(BACKUPS_DIR, `${safeId}.json`);

  try {
    // 2. Mevcut durumun otomatik güvenlik yedeğini al
    const currentSafety = createBackup("SAFETY", `"${backupId}" yedeği yüklenmeden önceki anlık durum`, {
      adminId: adminInfo.adminId,
      adminEmail: adminInfo.adminEmail,
      ip: adminInfo.ip,
    });

    const currentStore = getStoreData();

    // 3. Yedeği oku
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const restoredData: AppStoreData = parsed.data;

    // 4. Sipariş Koruması
    // Yedek zamanından sonra sipariş oluşmuşsa, finansal tutarsızlığı önlemek için bu siparişleri koru
    const backupTime = new Date(check.manifest.createdAt).getTime();
    if (preserveNewerOrders && currentStore.orders && currentStore.orders.length > 0) {
      const newerOrders: StoreOrder[] = currentStore.orders.filter(
        (o) => new Date(o.createdAt).getTime() > backupTime
      );

      if (newerOrders.length > 0) {
        const restoredOrderIds = new Set((restoredData.orders || []).map((o) => o.id));
        const combinedOrders = [...(restoredData.orders || [])];

        for (const order of newerOrders) {
          if (!restoredOrderIds.has(order.id)) {
            combinedOrders.unshift(order);
          }
        }
        restoredData.orders = combinedOrders;
      }

      // İade Talepleri Koruması
      if (currentStore.returnRequests && currentStore.returnRequests.length > 0) {
        const newerReturns = currentStore.returnRequests.filter(
          (r) => new Date(r.createdAt).getTime() > backupTime
        );
        if (newerReturns.length > 0) {
          const restoredReturnIds = new Set((restoredData.returnRequests || []).map((r) => r.id));
          const combinedReturns = [...(restoredData.returnRequests || [])];
          for (const ret of newerReturns) {
            if (!restoredReturnIds.has(ret.id)) {
              combinedReturns.unshift(ret);
            }
          }
          restoredData.returnRequests = combinedReturns;
        }
      }

      // Kargo Gönderileri Koruması
      if (currentStore.shipments && currentStore.shipments.length > 0) {
        const newerShipments = currentStore.shipments.filter(
          (s) => new Date(s.createdAt).getTime() > backupTime
        );
        if (newerShipments.length > 0) {
          const restoredShipmentIds = new Set((restoredData.shipments || []).map((s) => s.id));
          const combinedShipments = [...(restoredData.shipments || [])];
          for (const shp of newerShipments) {
            if (!restoredShipmentIds.has(shp.id)) {
              combinedShipments.unshift(shp);
            }
          }
          restoredData.shipments = combinedShipments;
        }
      }
    }

    // 5. Atomik Kayıt: Önce geçici dosyaya yaz, sonra rename yap
    const tempFile = path.join(DATA_DIR, `store.json.tmp-${Date.now()}`);
    fs.writeFileSync(tempFile, JSON.stringify(restoredData, null, 2), "utf-8");
    fs.renameSync(tempFile, STORE_FILE);

    // 6. Başarılı geri yükleme denetim kaydı (Audit log)
    logAdminAudit({
      adminId: adminInfo.adminId,
      adminEmail: adminInfo.adminEmail,
      action: "BACKUP_RESTORED",
      targetType: "BACKUP",
      targetId: backupId,
      result: "SUCCESS",
      ipAddress: adminInfo.ip,
      details: {
        restoredBackupId: backupId,
        safetyBackupId: currentSafety.manifest?.id,
        preservedNewerOrders: preserveNewerOrders,
        itemCounts: check.manifest.itemCounts,
      },
    });

    return {
      success: true,
      safetyBackupId: currentSafety.manifest?.id,
    };
  } catch (err: unknown) {
    console.error("Backup restore error:", err);
    logAdminAudit({
      adminId: adminInfo.adminId,
      adminEmail: adminInfo.adminEmail,
      action: "BACKUP_RESTORE_FAILED",
      targetType: "BACKUP",
      targetId: backupId,
      result: "FAILED",
      ipAddress: adminInfo.ip,
      details: { error: err instanceof Error ? err.message : "Geri yükleme sırasında hata oluştu." },
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Geri yükleme başarısız oldu.",
    };
  }
}

/**
 * Geri yükleme provası (Dry-Run):
 * Dosyaları değiştirmeden yedeği doğrular, korunacak kayıt sayılarını hesaplar ve sonucu simüle eder.
 */
export function dryRunRestore(
  backupId: string,
  preserveNewerOrders: boolean = true
): {
  success: boolean;
  manifest?: BackupManifest;
  preview?: {
    productsCount: number;
    categoriesCount: number;
    ordersCount: number;
    newerOrdersPreserved: number;
    newerReturnsPreserved: number;
    newerShipmentsPreserved: number;
  };
  error?: string;
} {
  const check = verifyBackupById(backupId);
  if (!check.isValid || !check.manifest) {
    return { success: false, error: check.error || "Bozuk veya geçersiz yedek dosyası." };
  }

  const safeId = path.basename(backupId).replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(BACKUPS_DIR, `${safeId}.json`);

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const restoredData: AppStoreData = parsed.data;
    const currentStore = getStoreData();

    let newerOrdersPreserved = 0;
    let newerReturnsPreserved = 0;
    let newerShipmentsPreserved = 0;

    const backupTime = new Date(check.manifest.createdAt).getTime();
    if (preserveNewerOrders) {
      if (currentStore.orders) {
        newerOrdersPreserved = currentStore.orders.filter(
          (o) => new Date(o.createdAt).getTime() > backupTime
        ).length;
      }
      if (currentStore.returnRequests) {
        newerReturnsPreserved = currentStore.returnRequests.filter(
          (r) => new Date(r.createdAt).getTime() > backupTime
        ).length;
      }
      if (currentStore.shipments) {
        newerShipmentsPreserved = currentStore.shipments.filter(
          (s) => new Date(s.createdAt).getTime() > backupTime
        ).length;
      }
    }

    return {
      success: true,
      manifest: check.manifest,
      preview: {
        productsCount: restoredData.products?.length || 0,
        categoriesCount: restoredData.categories?.length || 0,
        ordersCount: (restoredData.orders?.length || 0) + newerOrdersPreserved,
        newerOrdersPreserved,
        newerReturnsPreserved,
        newerShipmentsPreserved,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Prova geri yükleme başarısız oldu.",
    };
  }
}

