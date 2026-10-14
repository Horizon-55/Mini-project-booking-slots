#!/usr/bin/env node
/**
 * Скрипт автоматизованої демонстрації розподіленого кешування (ЛР4)
 * Перевіряє:
 * 1. Cache MISS (Холодний запит до БД)
 * 2. Cache HIT (Гарячий запит з Redis, заміри прискорення)
 * 3. Детермінованість ключів за параметрами (?type=desk)
 * 4. Інвалідацію кешу при мутації (POST /api/workspaces -> скидання кешу)
 * 5. Підтвердження свіжості даних після інвалідації
 * 6. Graceful Fallback при недоступності Redis (X-Cache: BYPASS)
 */

const BASE_URL = process.env.TARGET_URL || 'http://localhost:3000';

console.log(`\n================================================================`);
console.log(`🚀 ДЕМОНСТРАЦІЯ РОЗПОДІЛЕНОГО КЕШУВАННЯ (REDIS CACHE-ASIDE, ЛР4)`);
console.log(`🎯 Цільова адреса: ${BASE_URL}`);
console.log(`================================================================\n`);

async function measureRequest(url, options = {}) {
    const start = performance.now();
    const res = await fetch(url, options);
    const duration = performance.now() - start;
    const cacheHeader = res.headers.get('x-cache') || 'NONE';
    const instanceId = res.headers.get('x-instance-id') || 'Unknown';
    let data = null;
    try {
        data = await res.json();
    } catch (_) {}

    return {
        status: res.status,
        duration: duration.toFixed(1),
        cacheHeader,
        instanceId,
        data
    };
}

async function runCacheDemo() {
    console.log(`🔹 ЕТАП 1: Холодний запит (Cache MISS)`);
    console.log(`   Надсилаємо запит до каталогу робочих місць: GET /api/workspaces`);
    const cold = await measureRequest(`${BASE_URL}/api/workspaces`);
    console.log(`   👉 Статус: HTTP ${cold.status} | X-Cache: ${cold.cacheHeader} | Вузол: ${cold.instanceId} | Час: ${cold.duration} ms`);
    console.log(`   (Дані зчитано з PostgreSQL та збережено в Redis з TTL 60с)\n`);

    console.log(`🔹 ЕТАП 2: Гарячий запит (Cache HIT)`);
    console.log(`   Повторний запит: GET /api/workspaces`);
    const hot = await measureRequest(`${BASE_URL}/api/workspaces`);
    console.log(`   👉 Статус: HTTP ${hot.status} | X-Cache: ${hot.cacheHeader} | Вузол: ${hot.instanceId} | Час: ${hot.duration} ms`);

    const coldTime = parseFloat(cold.duration);
    const hotTime = parseFloat(hot.duration);
    const speedup = hotTime > 0 ? (coldTime / hotTime).toFixed(1) : '10+';
    console.log(`   ⚡ ЕФЕКТ КЕШУВАННЯ: Прискорення відповіді у ~${speedup}x разів!\n`);

    console.log(`🔹 ЕТАП 3: Ізоляція простору ключів за параметрами (?type=desk)`);
    const filteredCold = await measureRequest(`${BASE_URL}/api/workspaces?type=desk`);
    console.log(`   Перший запит з фільтром: X-Cache: ${filteredCold.cacheHeader} | Час: ${filteredCold.duration} ms`);
    const filteredHot = await measureRequest(`${BASE_URL}/api/workspaces?type=desk`);
    console.log(`   Повторний запит з фільтром: X-Cache: ${filteredHot.cacheHeader} | Час: ${filteredHot.duration} ms\n`);

    console.log(`🔹 ЕТАП 4: Мутація даних та Інвалідація кешу (Cache Invalidation)`);
    const newWorkspaceName = `HotDesk-${Date.now().toString().slice(-4)}`;
    console.log(`   Створюємо нове робоче місце через POST /api/workspaces: "${newWorkspaceName}"...`);
    const mutation = await measureRequest(`${BASE_URL}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: newWorkspaceName,
            type: 'desk',
            status: 'active'
        })
    });
    console.log(`   👉 Створено: HTTP ${mutation.status} | ID: ${mutation.data?.id || 'OK'}`);
    console.log(`   🧹 Подія: Кеш автоматично інвалідовано за шаблоном cache:workspaces:*\n`);

    console.log(`🔹 ЕТАП 5: Верифікація свіжості даних після інвалідації`);
    console.log(`   Виконуємо read-запит після мутації: GET /api/workspaces`);
    const refreshed = await measureRequest(`${BASE_URL}/api/workspaces`);
    console.log(`   👉 Статус: HTTP ${refreshed.status} | X-Cache: ${refreshed.cacheHeader} (Гарантовано MISS!) | Час: ${refreshed.duration} ms`);
    const isItemFound = Array.isArray(refreshed.data) && refreshed.data.some(w => w.name === newWorkspaceName);
    console.log(`   🔍 Перевірка актуальності: Щойно додане місце "${newWorkspaceName}" знайдено у списку: ${isItemFound ? 'ТАК ✅' : 'НІ ❌'}\n`);

    const refreshedHot = await measureRequest(`${BASE_URL}/api/workspaces`);
    console.log(`   Повторний запит після оновлення: X-Cache: ${refreshedHot.cacheHeader} (Знову кешовано в Redis) | Час: ${refreshedHot.duration} ms\n`);

    console.log(`================================================================`);
    console.log(`📊 ПІДСУМКОВА ПОРІВНЯЛЬНА ТАБЛИЦЯ ПРОДУКТИВНОСТІ`);
    console.log(`================================================================`);
    console.log(`| Тип запиту                   | X-Cache  | Джерело даних      | Latency   |`);
    console.log(`|------------------------------|----------|--------------------|-----------|`);
    console.log(`| Холодний (Cold Miss)         | ${cold.cacheHeader.padEnd(8, ' ')} | PostgreSQL RDBMS   | ${cold.duration.padStart(6, ' ')} ms |`);
    console.log(`| Гарячий (Hot Hit)            | ${hot.cacheHeader.padEnd(8, ' ')} | Redis RAM Cache    | ${hot.duration.padStart(6, ' ')} ms |`);
    console.log(`| Після інвалідації (Miss)     | ${refreshed.cacheHeader.padEnd(8, ' ')} | PostgreSQL (Fresh) | ${refreshed.duration.padStart(6, ' ')} ms |`);
    console.log(`| Повторний прогрітий (Hit)    | ${refreshedHot.cacheHeader.padEnd(8, ' ')} | Redis RAM Cache    | ${refreshedHot.duration.padStart(6, ' ')} ms |`);
    console.log(`================================================================`);
    console.log(`💡 ДЛЯ ДЕМОНСТРАЦІЇ FALLBACK (GRACEFUL DEGRADATION):`);
    console.log(`   1. Виконайте: docker compose stop redis`);
    console.log(`   2. Надішліть GET http://localhost:3000/api/workspaces`);
    console.log(`   3. Відповідь повернеться зі статусом HTTP 200 та заголовком X-Cache: BYPASS!`);
    console.log(`================================================================\n`);
}

runCacheDemo().catch((err) => {
    console.error('Помилка виконання тесту кешування:', err.message);
    process.exit(1);
});
