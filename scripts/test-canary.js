#!/usr/bin/env node
/**
 * Скрипт перевірки розподілу трафіку Canary Release (ЛР-6)
 * Надсилає серію запитів до /api/version і вимірює частку трафіку
 * між версіями застосунку (наприклад, 1.0.0 vs 1.1.0).
 */

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:30080/api/version';
const TOTAL_REQUESTS = parseInt(process.env.REQUESTS || '40', 10);

console.log('\n======================================================');
console.log('🐥 ТЕСТУВАННЯ CANARY TRAFFIC SPLIT (ARGO ROLLOUTS, ЛР-6)');
console.log(`🎯 Цільова адреса: ${TARGET_URL}`);
console.log(`📊 Кількість запитів: ${TOTAL_REQUESTS}`);
console.log('======================================================\n');

async function testCanarySplit() {
    const versionCounts = {};
    const instanceCounts = {};
    let successful = 0;
    let failed = 0;

    for (let i = 1; i <= TOTAL_REQUESTS; i++) {
        try {
            const start = performance.now();
            const res = await fetch(TARGET_URL);
            const duration = (performance.now() - start).toFixed(1);
            if (!res.ok) {
                console.log(`[#${i.toString().padStart(2, ' ')}] HTTP ${res.status} [FAIL]`);
                failed++;
                continue;
            }

            const data = await res.json();
            const version = data.version || 'unknown';
            const instance = data.instance || 'unknown';

            versionCounts[version] = (versionCounts[version] || 0) + 1;
            instanceCounts[instance] = (instanceCounts[instance] || 0) + 1;
            successful++;

            console.log(`[#${i.toString().padStart(2, ' ')}] Version: ${version.padEnd(8, ' ')} | Pod: ${instance.padEnd(28, ' ')} | Latency: ${duration}ms`);
        } catch (err) {
            console.log(`[#${i.toString().padStart(2, ' ')}] Error: ${err.message}`);
            failed++;
        }
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n======================================================');
    console.log('📈 РОЗПОДІЛ ТРАФІКУ ЗА ВЕРСІЯМИ (CANARY RATIO)');
    console.log('======================================================');
    console.log('| Версія застосунку | Запитів | Доля (%) |');
    console.log('|-------------------|---------|----------|');
    for (const [ver, count] of Object.entries(versionCounts)) {
        const pct = ((count / successful) * 100).toFixed(1);
        console.log(`| ${ver.padEnd(17, ' ')} | ${count.toString().padEnd(7, ' ')} | ${pct.padStart(6, ' ')}%  |`);
    }
    console.log('======================================================');
    console.log(`Успішних запитів: ${successful} / ${TOTAL_REQUESTS}`);
    if (failed > 0) console.log(`Помилок: ${failed}`);
    console.log('======================================================\n');
}

testCanarySplit().catch(err => {
    console.error('Помилка запуску тесту Canary:', err);
    process.exit(1);
});
