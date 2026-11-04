import fs from "node:fs";
import crypto from "node:crypto";
import { createBackup, verifyBackupById } from "../src/lib/server/backup";

const sourcePath = "data/store.json";
const original = fs.readFileSync(sourcePath);
const sourceHash = crypto.createHash("sha256").update(original).digest("hex");
const source = JSON.parse(original.toString("utf8"));
const backup = createBackup("SAFETY", "Faz 7.1 PostgreSQL geçişi öncesi kaynak store yedeği");
if (!backup.manifest) throw new Error(backup.error || "Faz 4.6 safety backup failed.");
const verification = verifyBackupById(backup.manifest.id);
if (!verification.isValid || verification.storedChecksum !== verification.calculatedChecksum) {
  throw new Error(verification.error || "Backup checksum verification failed.");
}
const currentHash = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
if (currentHash !== sourceHash) throw new Error("Source store changed while backup was created.");
console.log(JSON.stringify({
  backupId: backup.manifest.id,
  fileName: backup.manifest.fileName,
  sha256: verification.calculatedChecksum,
  checksumValid: verification.isValid,
  sourceUnchanged: true,
  counts: {
    categories: source.categories?.length ?? 0,
    collections: source.collections?.length ?? 0,
    products: source.products?.length ?? 0,
    variants: source.products?.reduce((sum: number, product: { variants?: unknown[] }) => sum + (product.variants?.length ?? 0), 0) ?? 0,
    media: source.products?.reduce((sum: number, product: { media?: unknown[] }) => sum + (product.media?.length ?? 0), 0) ?? 0,
    orders: source.orders?.length ?? 0,
    admins: source.adminUsers?.length ?? 0,
    shipments: source.shipments?.length ?? 0,
    returns: source.returnRequests?.length ?? 0,
    campaigns: source.campaigns?.length ?? 0,
  },
}, null, 2));
