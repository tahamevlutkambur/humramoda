import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const CONTAINER = "humra-postgres-test-83";
const DB_NAME = "humra_migration_test";
const SUPER_USER = "humra_test";

export const MIGRATOR_USER = "humra_migrator";
export const MIGRATOR_PASS = "MigratorSecurePass2026";
export const APP_USER = "humra_app";
export const APP_PASS = "AppRuntimePass2026";

export const MIGRATOR_URL = `postgresql://${MIGRATOR_USER}:${MIGRATOR_PASS}@127.0.0.1:5432/${DB_NAME}?schema=public`;
export const APP_URL = `postgresql://${APP_USER}:${APP_PASS}@127.0.0.1:5432/${DB_NAME}?schema=public`;

export async function setupProductionRoles(): Promise<void> {
  console.log("=== FAZ 8.9: PRODUCTION ROLLERİ KURULUMU ===");

  execSync(`docker cp scratch/setup_roles.sql ${CONTAINER}:/tmp/setup_roles.sql`, { stdio: "inherit" });
  execSync(`docker exec ${CONTAINER} psql -U ${SUPER_USER} -d ${DB_NAME} -f /tmp/setup_roles.sql`, { stdio: "inherit" });

  console.log("✔ humra_migrator ve humra_app rolleri başarıyla yapılandırıldı.");
}

async function verifyRoles() {
  await setupProductionRoles();

  // 1. humra_app ile bağlan
  console.log("\n[1] 'humra_app' bağlantısı test ediliyor...");
  const appPrisma = new PrismaClient({
    datasources: { db: { url: APP_URL } },
  });

  try {
    // Okuma testi
    const products: any[] = await appPrisma.$queryRaw`SELECT count(*) FROM "Product"`;
    console.log(`✔ SELECT Product başarılı. Kayıt: ${products[0].count}`);

    // DML Yazma testi (AuditLog)
    const testLogId = `audit_app_test_${Date.now()}`;
    await appPrisma.auditLog.create({
      data: {
        id: testLogId,
        adminId: "humra_app_test",
        adminEmail: "app@humramoda.local",
        action: "APP_ROLE_DML_VERIFICATION",
        targetType: "SECURITY",
        result: "SUCCESS",
        details: { verified: true },
      },
    });
    console.log("✔ INSERT AuditLog başarılı.");

    // DML Silme testi
    await appPrisma.auditLog.delete({ where: { id: testLogId } });
    console.log("✔ DELETE AuditLog başarılı.");

    // DDL Engeli Testi: CREATE TABLE engellenmeli
    let createTableBlocked = false;
    try {
      await appPrisma.$executeRawUnsafe(`CREATE TABLE "UnauthorizedTable" (id int);`);
    } catch (err: any) {
      createTableBlocked = true;
      console.log(`✔ CREATE TABLE güvenle engellendi: ${err.message.split("\n")[0]}`);
    }
    if (!createTableBlocked) {
      throw new Error("GÜVENLİK AÇIĞI: humra_app kullanıcısı CREATE TABLE yapabildi!");
    }

    // DDL Engeli Testi: DROP TABLE engellenmeli
    let dropTableBlocked = false;
    try {
      await appPrisma.$executeRawUnsafe(`DROP TABLE "Product";`);
    } catch (err: any) {
      dropTableBlocked = true;
      console.log(`✔ DROP TABLE güvenle engellendi: ${err.message.split("\n")[0]}`);
    }
    if (!dropTableBlocked) {
      throw new Error("GÜVENLİK AÇIĞI: humra_app kullanıcısı DROP TABLE yapabildi!");
    }

    // DDL Engeli Testi: ALTER TABLE engellenmeli
    let alterTableBlocked = false;
    try {
      await appPrisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "test_col" INT;`);
    } catch (err: any) {
      alterTableBlocked = true;
      console.log(`✔ ALTER TABLE güvenle engellendi: ${err.message.split("\n")[0]}`);
    }
    if (!alterTableBlocked) {
      throw new Error("GÜVENLİK AÇIĞI: humra_app kullanıcısı ALTER TABLE yapabildi!");
    }

    console.log("\n=== 'humra_app' LEAST PRIVILEGE PROVASI %100 BAŞARILI! ===");
  } finally {
    await appPrisma.$disconnect();
  }
}

if (require.main === module) {
  verifyRoles().catch((err) => {
    console.error("Rol doğrulama başarısız:", err);
    process.exit(1);
  });
}
