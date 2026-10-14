#!/usr/bin/env node
/**
 * Скрипт верифікації розподілу навантаження (ЛР3 п. 2.3.1 та п. 4.1)
 * Відправляє N послідовних/конкурентних запитів через балансувальник Nginx (http://localhost:3000)
 * і збирає статистику за заголовком X-Instance-ID.
 */

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000/health';
const TOTAL_REQUESTS = parseInt(process.argv[2] || '60', 10);

console.log(`\n======================================================`);
console.log(`🚀 ЗАПУСК ТЕСТУВАННЯ БАЛАНСУВАННЯ НАВАНТАЖЕННЯ`);
console.log(`🎯 Цільова адреса: ${TARGET_URL}`);
console.log(`📊 Кількість запитів: ${TOTAL_REQUESTS}`);
console.log(`======================================================\n`);

async function runTest() {
    const instanceStats = {};
    const latencies = [];
    let successCount = 0;
    let failCount = 0;

    const startTime = Date.now();

    for (let i = 1; i <= TOTAL_REQUESTS; i++) {
        const reqStart = performance.now();
        try {
            const res = await fetch(TARGET_URL);
            const reqDuration = performance.now() - reqStart;
            latencies.push(reqDuration);

            const instanceId = res.headers.get('x-instance-id') || 'Unknown/Nginx';
            const status = res.status;

            if (status >= 200 && status < 400) {
                successCount++;
            } else {
                failCount++;
            }

            if (!instanceStats[instanceId]) {
                instanceStats[instanceId] = {
                    count: 0,
                    latencies: []
                };
            }
            instanceStats[instanceId].count++;
            instanceStats[instanceId].latencies.push(reqDuration);

            process.stdout.write(`[#${i.toString().padStart(3, ' ')}] Status: ${status} | Instance: ${instanceId.padEnd(16, ' ')} | Latency: ${reqDuration.toFixed(1)}ms\n`);
        } catch (err) {
            failCount++;
            console.error(`[#${i.toString().padStart(3, ' ')}] ПОМИЛКА: ${err.message}`);
        }
    }

    const totalDuration = (Date.now() - startTime) / 1000;
    const rps = (TOTAL_REQUESTS / totalDuration).toFixed(2);

    console.log(`\n======================================================`);
    console.log(`📈 РЕЗУЛЬТАТИ РОЗПОДІЛУ ТРАФІКУ ЗА INSTANCE ID`);
    console.log(`======================================================`);
    console.log(`| Вузол (Instance ID) | Запитів | Доля (%) | Середній Latency |`);
    console.log(`|---------------------|---------|----------|------------------|`);

    for (const [id, stat] of Object.entries(instanceStats)) {
        const share = ((stat.count / TOTAL_REQUESTS) * 100).toFixed(1);
        const avgLat = (stat.latencies.reduce((a, b) => a + b, 0) / stat.latencies.length).toFixed(1);
        console.log(`| ${id.padEnd(19, ' ')} | ${stat.count.toString().padEnd(7, ' ')} | ${(share + '%').padEnd(8, ' ')} | ${(avgLat + ' ms').padEnd(16, ' ')} |`);
    }

    console.log(`======================================================`);
    console.log(`Всього успішних запитів: ${successCount} / ${TOTAL_REQUESTS} (${((successCount / TOTAL_REQUESTS) * 100).toFixed(1)}%)`);
    console.log(`Помилок: ${failCount}`);
    console.log(`Загальний час: ${totalDuration.toFixed(2)} сек | Пропускна здатність: ${rps} req/sec`);
    console.log(`======================================================\n`);
}

runTest().catch((err) => {
    console.error('Критична помилка виконання тесту:', err);
    process.exit(1);
});
