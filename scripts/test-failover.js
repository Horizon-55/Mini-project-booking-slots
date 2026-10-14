#!/usr/bin/env node
/**
 * Скрипт симуляції відмови вузла в реальному часі (ЛР3 п. 2.4.3 та п. 4.3)
 * Безперервно надсилає запити до кластера з інтервалом 200 мс.
 * Дозволяє в іншому терміналі виконати:
 *     docker compose stop api1
 * або:
 *     docker compose kill api1
 * і наочно демонструє, що Nginx (завдяки proxy_next_upstream)
 * автоматично повторює запит на робочих інстансах api2/api3 без жодної помилки 5xx для користувача!
 */

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000/health';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '200', 10);
const DURATION_SECONDS = parseInt(process.argv[2] || '30', 10);

console.log(`\n======================================================`);
console.log(`🛡️  ТЕСТ СИМУЛЯЦІЇ ВІДМОВИ ВУЗЛА (HIGH AVAILABILITY & FAULT TOLERANCE)`);
console.log(`🎯 Ціль: ${TARGET_URL}`);
console.log(`⏱️  Інтервал між запитами: ${INTERVAL_MS} ms`);
console.log(`⏳ Тривалість моніторингу: ${DURATION_SECONDS} секунд`);
console.log(`------------------------------------------------------`);
console.log(`💡 ПІД ЧАС ЦЬОГО ТЕСТУ виконайте у паралельному терміналі:`);
console.log(`   docker compose stop api1`);
console.log(`   (або docker compose kill api1)`);
console.log(`і спостерігайте за безшовним переключенням без жодної 5xx!`);
console.log(`======================================================\n`);

async function runFailoverTest() {
    let reqIndex = 0;
    let totalSuccess = 0;
    let total5xx = 0;
    let totalConnErrors = 0;
    const history = [];

    const stopTime = Date.now() + (DURATION_SECONDS * 1000);

    while (Date.now() < stopTime) {
        reqIndex++;
        const start = performance.now();
        const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);

        try {
            const res = await fetch(TARGET_URL);
            const duration = (performance.now() - start).toFixed(1);
            const instanceId = res.headers.get('x-instance-id') || 'Unknown';
            const status = res.status;

            if (status >= 500) {
                total5xx++;
                console.log(`🔴 [${timestamp}] Req #${reqIndex} | HTTP ${status} | Instance: ${instanceId} | Latency: ${duration}ms [FAILED]`);
            } else {
                totalSuccess++;
                console.log(`🟢 [${timestamp}] Req #${reqIndex} | HTTP ${status} | Instance: ${instanceId.padEnd(16, ' ')} | Latency: ${duration}ms [OK]`);
            }

            history.push({ instanceId, status, duration });
        } catch (err) {
            totalConnErrors++;
            console.log(`❌ [${timestamp}] Req #${reqIndex} | Network Error: ${err.message}`);
        }

        await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }

    console.log(`\n======================================================`);
    console.log(`📋 ПІДСУМОК ТЕСТУ НА ВІДМОВОСТІЙКІСТЬ (FAULT TOLERANCE)`);
    console.log(`======================================================`);
    console.log(`Всього запитів відправлено   : ${reqIndex}`);
    console.log(`Успішно оброблено (2xx/3xx)  : ${totalSuccess} (${((totalSuccess / reqIndex) * 100).toFixed(1)}%)`);
    console.log(`Помилок сервера (HTTP 5xx)   : ${total5xx}`);
    console.log(`Мережевих розривів (Drop)    : ${totalConnErrors}`);
    console.log(`------------------------------------------------------`);
    if (total5xx === 0 && totalConnErrors === 0) {
        console.log(`🏆 РЕЗУЛЬТАТ: ВІДМІННО! 100% High Availability досягнуто.`);
        console.log(`   Механізм Nginx proxy_next_upstream повністю ізолював збій вузла від клієнта.`);
    } else {
        console.log(`⚠️  Виявлено збої під час перемикання upstream.`);
    }
    console.log(`======================================================\n`);
}

runFailoverTest().catch(console.error);
