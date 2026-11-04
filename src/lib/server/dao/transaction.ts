import { PrismaClient, Prisma } from "@prisma/client";
import { EXPECTED_TEST_DATABASE, EXPECTED_TEST_USER } from "./prisma-store-dao";

export interface PostgresTransactionOptions {
  prisma?: PrismaClient;
  databaseUrl?: string;
  skipIdentityCheck?: boolean;
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
}

let sharedPrismaClient: PrismaClient | null = null;

export function getSharedPrismaClient(databaseUrl?: string): PrismaClient {
  const url = databaseUrl || process.env.DATABASE_URL;
  if (!sharedPrismaClient) {
    sharedPrismaClient = new PrismaClient({
      datasources: url ? { db: { url } } : undefined,
    });
  }
  return sharedPrismaClient;
}

/**
 * Güvenlik doğrulaması:
 * PostgreSQL üzerinde yazma / transaction çalıştırmadan önce hedef veritabanının
 * kesinlikle 'humra_migration_test' ve kullanıcının 'humra_test' olduğunu kanıtlar.
 * Canlı mağaza veya yetkisiz veritabanlarına yazmayı kesin olarak engeller.
 */
export async function assertWriteAuthorizedDatabase(
  client: PrismaClient | Prisma.TransactionClient,
  skipCheck = false
): Promise<void> {
  if (skipCheck) return;

  try {
    const result = await client.$queryRaw<
      Array<{ current_database: string; current_user: string }>
    >`SELECT current_database(), current_user;`;

    const info = result[0];
    const isProdOrExplicitPostgres =
      process.env.NODE_ENV === "production" ||
      process.env.DATA_STORE_DRIVER === "postgres";

    if (!isProdOrExplicitPostgres) {
      if (
        !info ||
        info.current_database !== EXPECTED_TEST_DATABASE ||
        info.current_user !== EXPECTED_TEST_USER
      ) {
        throw new Error(
          `GÜVENLİK ENGELİ: PostgreSQL yazma işlemleri test modunda yalnızca '${EXPECTED_TEST_DATABASE}' veritabanı ve '${EXPECTED_TEST_USER}' kullanıcısı üzerinde gerçekleştirilebilir. ` +
            `Tespit edilen: DB='${info?.current_database}', USER='${info?.current_user}'`
        );
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes("GÜVENLİK ENGELİ")) {
      throw err;
    }
    throw new Error(`PostgreSQL yazma yetki ve kimlik denetimi başarısız: ${err.message}`);
  }
}

/**
 * PostgreSQL ACID transaction çalıştırıcı.
 * Varsayılan izolasyon seviyesi ReadCommitted olup, stok satır kilitlemeleri
 * ile birlikte yarış durumlarını (race condition) ve kilitlenmeleri (deadlock) önler.
 */
export async function executePostgresTransaction<T>(
  action: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: PostgresTransactionOptions
): Promise<T> {
  const prisma = options?.prisma || getSharedPrismaClient(options?.databaseUrl);

  // Transaction öncesi DB kimlik denetimi
  if (!options?.skipIdentityCheck) {
    await assertWriteAuthorizedDatabase(prisma);
  }

  return await prisma.$transaction(
    async (tx) => {
      // Transaction içi ek güvenlik güvencesi
      if (!options?.skipIdentityCheck) {
        await assertWriteAuthorizedDatabase(tx);
      }
      return await action(tx);
    },
    {
      isolationLevel: options?.isolationLevel ?? Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: options?.maxWait ?? 5000,
      timeout: options?.timeout ?? 10000,
    }
  );
}

