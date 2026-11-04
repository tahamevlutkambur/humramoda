import { IStoreDAO, DataStoreDriver, DAOFactoryOptions } from "./types";
import { JsonStoreDAO } from "./json-store-dao";
import { PrismaStoreDAO } from "./prisma-store-dao";

let cachedJsonDao: JsonStoreDAO | null = null;
let cachedPrismaDao: PrismaStoreDAO | null = null;

/**
 * Aktif veri sürücüsünü belirler.
 * Kural: Varsayılan değer kesinlikle "json"dur.
 * "postgres" yalnızca process.env.DATA_STORE_DRIVER === "postgres" olduğunda seçilebilir.
 */
export function getActiveStoreDriver(): DataStoreDriver {
  const envDriver = process.env.DATA_STORE_DRIVER?.trim().toLowerCase();
  if (envDriver === "postgres") {
    return "postgres";
  }
  return "json";
}

/**
 * Belirtilen sürücüye göre DAO örneği üretir veya önbellekten döndürür.
 * 
 * Güvenlik Kuralları:
 * - Varsayılan sürücü JSON'dur.
 * - PostgreSQL seçildiğinde hedef DB'nin 'humra_migration_test' ve kullanıcının 'humra_test' olduğu doğrulanır.
 * - Production veya yetkisiz veritabanlarında hata fırlatılır.
 */
export function createStoreDAO(
  driver?: DataStoreDriver,
  options?: DAOFactoryOptions
): IStoreDAO {
  const targetDriver = driver || options?.driver || getActiveStoreDriver();

  if (targetDriver === "postgres") {
    // Test veya özel bağlantı seçenekleri varsa yeni bir instance üret
    if (options?.databaseUrl || options?.skipIdentityCheck) {
      return new PrismaStoreDAO({
        databaseUrl: options.databaseUrl,
        skipIdentityCheck: options.skipIdentityCheck,
      });
    }

    if (!cachedPrismaDao) {
      cachedPrismaDao = new PrismaStoreDAO();
    }
    return cachedPrismaDao;
  }

  // Varsayılan: JSON DAO
  if (!cachedJsonDao) {
    cachedJsonDao = new JsonStoreDAO();
  }
  return cachedJsonDao;
}

/**
 * Uygulama genelinde kullanılan varsayılan DAO erişim noktası.
 */
export function getStoreDAO(options?: DAOFactoryOptions): IStoreDAO {
  return createStoreDAO(undefined, options);
}

/**
 * Testler için DAO önbelleğini sıfırlar.
 */
export function resetDAOCache(): void {
  cachedJsonDao = null;
  cachedPrismaDao = null;
}

