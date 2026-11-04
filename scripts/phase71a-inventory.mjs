import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const root = process.cwd();
const uploadsRoot = path.join(root, "public", "uploads");
const storePath = path.join(root, "data", "store.json");
const outputPath = path.join(root, "docs", "FAZ-7.1A-GORSEL-ENVANTERI.md");
const store = JSON.parse(fs.readFileSync(storePath, "utf8"));

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function sniffMime(buffer, extension) {
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString() === "ftyp") {
    const brands = buffer.subarray(8, 16).toString();
    if (/avif|avis/.test(brands)) return "image/avif";
    return "video/mp4";
  }
  if (extension === ".json") return "application/json";
  return "application/octet-stream";
}

const allPaths = filesUnder(uploadsRoot).sort((a, b) => a.localeCompare(b, "en"));
const pathToRecord = new Map();
const hashToPaths = new Map();
for (const fullPath of allPaths) {
  const relative = path.relative(uploadsRoot, fullPath).split(path.sep).join("/");
  pathToRecord.set(`/uploads/${relative}`, fullPath);
  const hash = sha256(fs.readFileSync(fullPath));
  const siblings = hashToPaths.get(hash) || [];
  siblings.push(relative);
  hashToPaths.set(hash, siblings);
}

const directReferences = new Map();
const embeddedHashes = new Map();
for (const product of store.products || []) {
  for (const [index, media] of (product.media || []).entries()) {
    for (const field of ["url", "thumbnailUrl", "posterUrl"]) {
      const value = media?.[field];
      if (!value || typeof value !== "string") continue;
      const reference = { productId: product.id, productTitle: product.title, slug: product.slug, mediaId: media.id || `index-${index}`, field };
      if (value.startsWith("/uploads/")) {
        const list = directReferences.get(value) || [];
        list.push(reference);
        directReferences.set(value, list);
      } else if (value.startsWith("data:")) {
        const comma = value.indexOf(",");
        const bytes = comma >= 0 ? Buffer.from(value.slice(comma + 1), "base64") : Buffer.alloc(0);
        const hash = sha256(bytes);
        const list = embeddedHashes.get(hash) || [];
        list.push(reference);
        embeddedHashes.set(hash, list);
      }
    }
  }
}

const familyFor = (relative) => relative
  .replace(/\.(?:webp|avif|jpe?g|png|heic|heif)$/i, "")
  .replace(/-(?:thumb|card|detail)$/i, "");
const records = [];
for (const fullPath of allPaths) {
  const relative = path.relative(uploadsRoot, fullPath).split(path.sep).join("/");
  const extension = path.extname(fullPath).toLowerCase();
  const buffer = fs.readFileSync(fullPath);
  const hash = sha256(buffer);
  let accessible = true;
  try { fs.accessSync(fullPath, fs.constants.R_OK); } catch { accessible = false; }
  const explicit = directReferences.get(`/uploads/${relative}`) || [];
  const content = embeddedHashes.get(hash) || [];
  const refList = [...explicit.map((x) => ({ ...x, evidence: "exact URL reference" })), ...content.map((x) => ({ ...x, evidence: "exact SHA256 match to embedded media" }))];
  let dimensions = "—";
  if ([".avif", ".webp", ".jpg", ".jpeg", ".png"].includes(extension)) {
    try {
      const metadata = await sharp(buffer).metadata();
      dimensions = metadata.width && metadata.height ? `${metadata.width}×${metadata.height}` : "unknown";
    } catch { dimensions = "unreadable"; }
  }
  const family = familyFor(relative);
  const sameContent = (hashToPaths.get(hash) || []).filter((candidate) => candidate !== relative);
  const siblings = allPaths
    .filter((candidate) => candidate !== fullPath && familyFor(path.relative(uploadsRoot, candidate).split(path.sep).join("/")) === family)
    .map((candidate) => path.relative(uploadsRoot, candidate).split(path.sep).join("/"));
  records.push({
    relative,
    bytes: fs.statSync(fullPath).size,
    extension: extension || "(none)",
    mime: sniffMime(buffer, extension),
    hash,
    accessible,
    dimensions,
    productRefs: refList,
    siblings,
    sameContent,
  });
}

const base64Refs = [...embeddedHashes.values()].flat().length;
const exactContentMatchedRefs = records.reduce((sum, record) => sum + record.productRefs.filter((ref) => ref.evidence.includes("SHA256")).length, 0);
const report = [
  "# HÜMRA MODA — Faz 7.1A Görsel Envanteri",
  "",
  `Oluşturulma: ${new Date().toISOString()}`,
  "",
  "Salt okunur tarama: `public/uploads` içindeki dosyalara yazılmadı, dosya silinmedi veya yeniden adlandırılmadı.",
  "",
  `- Toplam fiziksel dosya: **${records.length}** (beklenen: 146)`,
  `- Okunabilir dosya: **${records.filter((x) => x.accessible).length}**`,
  `- MIME imzası uzantıyla uyumsuz/tespit edilemeyen: **${records.filter((x) => x.mime === "application/octet-stream").length}**`,
  `- JSON ürün medya alanlarındaki inline data URI referansları: **${base64Refs}**`,
  `- Inline medya ile birebir SHA256 eşleşen public dosya referansı: **${exactContentMatchedRefs}**`,
  `- Aynı SHA256 içeriğine sahip farklı dosya yolları: **${records.filter((x) => x.sameContent.length > 0).length} dosya**`,
  "- Ürün bağlantısı yalnız tam URL veya inline içeriğin birebir hash eşleşmesiyle yazıldı; dosya adına bakılarak ürün ataması yapılmadı.",
  "- Aynı kaynak kökünden türetilen thumb/card/detail ve WebP/AVIF kardeş dosyalar listelenmiştir; bu ad benzerliği ürün eşleştirmesi anlamına gelmez.",
  "",
  "| Dosya | Boyut (byte) | Uzantı | MIME (imza) | Boyut px | SHA256 | Erişim | Ürün referansı (kanıt) | Türev/kardeş dosyalar | Aynı içerik hash’i |",
  "|---|---:|---|---|---|---|---|---|---|---|",
  ...records.map((record) => {
    const productRefs = record.productRefs.length
      ? record.productRefs.map((ref) => `${ref.productTitle} (${ref.productId}; ${ref.evidence}; ${ref.field})`).join("<br>")
      : "Eşleşme yok; manuel inceleme";
    return `| \`${record.relative}\` | ${record.bytes} | ${record.extension} | ${record.mime} | ${record.dimensions} | \`${record.hash}\` | ${record.accessible ? "OK" : "OKUNAMIYOR"} | ${productRefs.replaceAll("|", "\\|")} | ${record.siblings.length ? record.siblings.map((x) => `\`${x}\``).join("<br>") : "—"} | ${record.sameContent.length ? record.sameContent.map((x) => `\`${x}\``).join("<br>") : "—"} |`;
  }),
  "",
].join("\n");

fs.writeFileSync(outputPath, `${report}\n`, "utf8");
console.log(JSON.stringify({ output: path.relative(root, outputPath), totalFiles: records.length, readable: records.filter((x) => x.accessible).length, mimeUnknown: records.filter((x) => x.mime === "application/octet-stream").length, inlineMediaReferences: base64Refs, exactContentMatches: exactContentMatchedRefs }));
