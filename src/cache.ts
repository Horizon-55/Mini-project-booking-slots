import { redisClient } from './db';

/**
 * Модуль розподіленого кешування (Distributed Caching) для ЛР4
 * Реалізує:
 * - Патерн Cache-Aside (Lazy Loading)
 * - Детерміновану схему ключів (Cache Key Design)
 * - Політику TTL (Time-To-Live)
 * - Інвалідацію кешу (Cache Invalidation)
 * - Graceful Degradation / Fallback у разі відмови Redis (п. 2.6.3 методички)
 */

// Регламент TTL: 60 секунд (баланс між розвантаженням БД та актуальністю каталогу робочих місць)
export const DEFAULT_CACHE_TTL_SECONDS = 60;

/**
 * Схема ключів кешування (Cache Key Design, п. 2.4 методички):
 * Шаблон: domain:entity:scope:params
 */
export const CacheKeys = {
    workspacesList: (type?: string): string => {
        const normalizedType = type ? type.trim().toLowerCase() : 'all';
        return `cache:workspaces:list:type=${normalizedType}`;
    },
    workspacesPattern: (): string => 'cache:workspaces:*'
};

export interface CacheLookupResult<T> {
    data: T | null;
    isAvailable: boolean; // false, якщо Redis недоступний (Fallback режим)
}

/**
 * Отримання даних з кешу (Cache Lookup) із захистом від падіння Redis (Fallback)
 */
export async function getFromCache<T>(key: string): Promise<CacheLookupResult<T>> {
    try {
        if (!redisClient.isReady) {
            console.warn(`[Cache Fallback] Redis не готовий до обробки запитів. Bypassing cache for key: ${key}`);
            return { data: null, isAvailable: false };
        }

        const cachedValue = await redisClient.get(key);
        if (!cachedValue) {
            return { data: null, isAvailable: true }; // Cache Miss
        }

        return { data: JSON.parse(cachedValue) as T, isAvailable: true }; // Cache Hit
    } catch (error: any) {
        console.warn(`[Cache Fallback Warning] Помилка зчитування з Redis (${error.message}). Перехід на пряму роботу з БД.`);
        return { data: null, isAvailable: false };
    }
}

/**
 * Збереження даних у кеш із політикою TTL
 */
export async function setToCache(
    key: string,
    value: any,
    ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
): Promise<boolean> {
    try {
        if (!redisClient.isReady) return false;

        const serialized = JSON.stringify(value);
        await redisClient.set(key, serialized, { EX: ttlSeconds });
        return true;
    } catch (error: any) {
        console.warn(`[Cache Warning] Не вдалося зберегти ключ ${key} у Redis: ${error.message}`);
        return false;
    }
}

/**
 * Інвалідація кешу за патерном або ключем (п. 2.5 методички)
 */
export async function invalidateCachePattern(pattern: string): Promise<number> {
    try {
        if (!redisClient.isReady) return 0;

        const keys = await redisClient.keys(pattern);
        if (keys && keys.length > 0) {
            const deletedCount = await redisClient.del(keys);
            console.log(`[Cache Invalidation] Інвалідовано ${deletedCount} ключів за шаблоном: ${pattern}`);
            return deletedCount;
        }
        return 0;
    } catch (error: any) {
        console.warn(`[Cache Invalidation Warning] Помилка інвалідації шаблону ${pattern}: ${error.message}`);
        return 0;
    }
}
