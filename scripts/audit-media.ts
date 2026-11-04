import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const storePath = path.join(projectRoot, "data", "store.json");
const uploadRoot = path.join(projectRoot, "public", "uploads");
const reportPath = path.join(projectRoot, "docs", "FAZ-7-GORSEL-DENETIM.json");

type Reference = { path: string; productId?: string; key: string };
const references: Reference[] = [];
function collect(value: unknown, productId?: string, key = "root"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, productId, `${key}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const currentProductId = typeof record.id === "string" && "title" in record && "variants" in record
    ? record.id
    : productId;
  for (const [name, child] of Object.entries(record)) {
    const isMediaReference = /(?:image|video|poster|media)/i.test(name) ||
      (name === "url" && /\.media\[/.test(key));
    if (typeof child === "string" && isMediaReference) {
      references.push({ path: child, productId: currentProductId, key: `${key}.${name}` });
    } else {
      collect(child, currentProductId, `${key}.${name}`);
    }
  }
}

function listFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

if (!fs.existsSync(storePath)) {
  console.error("Media audit: data/store.json bulunamadı; veritabanı store kaynağı olmadığı için tarama yapılamadı.");
  process.exitCode = 1;
} else {
  const store = JSON.parse(fs.readFileSync(storePath, "utf8")) as unknown;
  collect(store);
  const localReferences = references.filter((ref) => ref.path.startsWith("/uploads/"));
  const invalidUrls = references.filter((ref) => {
    if (ref.path.startsWith("data:")) return false;
    if (ref.path.startsWith("/uploads/")) return false;
    if (/^https?:\/\//i.test(ref.path)) return false;
    return true;
  });
  const missing = localReferences.filter((ref) => {
    const decoded = decodeURIComponent(ref.path.split(/[?#]/)[0]);
    const full = path.resolve(uploadRoot, decoded.slice("/uploads/".length));
    return !full.startsWith(`${path.resolve(uploadRoot)}${path.sep}`) || !fs.existsSync(full);
  });
  const productsByPath = new Map<string, Set<string>>();
  for (const ref of references) {
    if (!ref.productId || !ref.path) continue;
    const ids = productsByPath.get(ref.path) || new Set<string>();
    ids.add(ref.productId);
    productsByPath.set(ref.path, ids);
  }
  const sharedAcrossProducts = [...productsByPath.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([mediaPath, ids]) => ({ path: mediaPath, productCount: ids.size }));
  const files = listFiles(uploadRoot);
  const existingWebpAvif = new Set(files.filter((file) => [".webp", ".avif"].includes(path.extname(file).toLowerCase())).map((file) => path.resolve(file)));
  const referencedConversions = localReferences.filter((ref) => /\.(?:webp|avif)$/i.test(ref.path));
  const missingConversions = referencedConversions.filter((ref) => {
    const full = path.resolve(uploadRoot, decodeURIComponent(ref.path.split(/[?#]/)[0].slice("/uploads/".length)));
    return !existingWebpAvif.has(full);
  });

  const report = {
    generatedAt: new Date().toISOString(),
    source: "data/store.json (runtime app store); Prisma tables are not currently used as catalog source",
    totalReferences: references.length,
    localUploadReferences: localReferences.length,
    accessibleLocalFiles: localReferences.length - missing.length,
    missingPhysicalFiles: missing.length,
    invalidUrlCount: invalidUrls.length,
    referencedWebpAvifCount: referencedConversions.length,
    missingWebpAvifCount: missingConversions.length,
    sharedAcrossProductsCount: sharedAcrossProducts.length,
    missingFiles: missing.map(({ path: mediaPath, key }) => ({ path: mediaPath, reference: key })),
    invalidUrls: invalidUrls.map(({ path: mediaPath, key }) => ({ path: mediaPath, reference: key })),
    missingConversions: missingConversions.map(({ path: mediaPath, key }) => ({ path: mediaPath, reference: key })),
    sharedAcrossProducts,
    remoteUrls: references.filter((ref) => /^https?:\/\//i.test(ref.path)).length,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, missingFiles: report.missingFiles.length, invalidUrls: report.invalidUrls.length, missingConversions: report.missingConversions.length, sharedAcrossProducts: report.sharedAcrossProducts.length }, null, 2));
}
