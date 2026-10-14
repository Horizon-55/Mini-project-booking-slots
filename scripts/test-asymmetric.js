#!/usr/bin/env node
/**
 * Скрипт тестування асиметричного навантаження (ЛР3 п. 2.3.3)
 * Порівняння Round Robin та Least Connections:
 * Відправляє конкурентні запити з асиметричною затримкою або до гетерогенного кластера
 * та обраховує перцентилі часу відгуку: p50, p90, p95, p99.
 */

const BASE_URL = process.env.TARGET_URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);
const TOTAL_REQUESTS = parseInt(process.argv[2] || '90', 10);

console.log(`\n======================================================`);
console.log(`⚡ ЕКСПЕРИМЕНТ З АСИМЕТРИЧНИМ НАВАНТАЖЕННЯМ (LATENCY & p99)`);
console.log(`🎯 Базовий URL: ${BASE_URL}`);
console.log(`👥 Рівень паралелізму (Concurrency): ${CONCURRENCY}`);
console.log(`📊 Загальна кількість запитів: ${TOTAL_REQUESTS}`);
console.log(`======================================================\n`);

function calculatePercentile(sortedArr, p) {
    if (sortedArr.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))];
}

async function runAsymmetricTest() {
    const latencies = [];
    const instanceStats = {};
    let completed = 0;
    let errors = 0;

    const startTime = Date.now();

    async function sendRequest(reqId) {
        const reqStart = performance.now();
        try {
            // Звертаємося до ендпоінту списку робочих місць
            const res = await fetch(`${BASE_URL}/api/workspaces`);
            const duration = performance.now() - reqStart;
            latencies.push(duration);

            const instanceId = res.headers.get('x-instance-id') || 'Unknown';
            if (!instanceStats[instanceId]) {
                instanceStats[instanceId] = { count: 0, latencies: [] };
            }
            instanceStats[instanceId].count++;
            instanceStats[instanceId].latencies.push(duration);
        } catch (err) {
            errors++;
            console.error(`[Req #${reqId}] Помилка:`, err.message);
        } finally {
            completed++;
            if (completed % 15 === 0 || completed === TOTAL_REQUESTS) {
                process.stdout.write(`Прогрес: ${completed}/${TOTAL_REQUESTS} оброблено...\n`);
            }
        }
    }

    // Запуск через обмежений пул паралельних запитів (Worker pool)
    const queue = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i + 1);
    const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length > 0) {
            const reqId = queue.shift();
            await sendRequest(reqId);
        }
    });

    await Promise.all(workers);

    const totalSeconds = (Date.now() - startTime) / 1000;
    latencies.sort((a, b) => a - b);

    const p50 = calculatePercentile(latencies, 50).toFixed(1);
    const p90 = calculatePercentile(latencies, 90).toFixed(1);
    const p95 = calculatePercentile(latencies, 95).toFixed(1);
    const p99 = calculatePercentile(latencies, 99).toFixed(1);
    const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1);

    console.log(`\n======================================================`);
    console.log(`📊 МЕТРИКИ ЗАТРИМКИ (LATENCY PERCENTILES)`);
    console.log(`======================================================`);
    console.log(`• Average Latency: ${avg} ms`);
    console.log(`• p50 (Median)   : ${p50} ms`);
    console.log(`• p90            : ${p90} ms`);
    console.log(`• p95            : ${p95} ms`);
    console.log(`• p99            : ${p99} ms  <-- Критичний індикатор "хвостової" затримки`);
    console.log(`------------------------------------------------------`);
    console.log(`Пропускна спроможність: ${(TOTAL_REQUESTS / totalSeconds).toFixed(2)} req/sec`);
    console.log(`Помилок: ${errors}`);
    console.log(`\nРозподіл по екземплярах:`);
    for (const [id, stat] of Object.entries(instanceStats)) {
        const share = ((stat.count / TOTAL_REQUESTS) * 100).toFixed(1);
        const nodeAvg = (stat.latencies.reduce((a, b) => a + b, 0) / stat.latencies.length).toFixed(1);
        console.log(`  - [${id}]: ${stat.count} reqs (${share}%) | avg latency: ${nodeAvg} ms`);
    }

    console.log(`\n💡 ІНЖЕНЕРНИЙ ВИСНОВОК:`);
    console.log(`- У Round Robin трафік ділиться порівну незалежно від часу виконання, тому повільний вузол накопичує чергу і p99 різко зростає.`);
    console.log(`- У Least Connections балансувальник скеровує нові запити на швидкі вузли (з меншою кількістю активних TCP-з'єднань), утилізуючи кластер значно ефективніше та мінімізуючи p99.`);
    console.log(`======================================================\n`);
}

runAsymmetricTest().catch(console.error);
