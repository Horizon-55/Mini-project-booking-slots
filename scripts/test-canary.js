#!/usr/bin/env node
/**
 * Скрипт перевірки розподілу трафіку Canary Release (ЛР-6)
 * Надсилає серію запитів до /api/version і вимірює частку трафіку
 * між версіями застосунку (наприклад, 1.0.0 vs 1.1.0).
 * 
 * Підтримує два режими:
 * 1. Прямий HTTP fetch (якщо налаштовано Ingress / Port-forwarding).
 * 2. Автоматичний Fallback через kubectl exec всередині кластера (для Minikube на Windows).
 */

const { execSync } = require('child_process');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:30080/api/version';
const TOTAL_REQUESTS = parseInt(process.env.REQUESTS || '20', 10);

console.log('\n======================================================');
console.log('🐥 ТЕСТУВАННЯ CANARY TRAFFIC SPLIT (ARGO ROLLOUTS, ЛР-6)');
console.log(`🎯 Ціль: http://booking-app/api/version`);
console.log(`📊 Кількість запитів: ${TOTAL_REQUESTS}`);
console.log('======================================================\n');

let useClusterExec = false;

async function queryVersion() {
    if (!useClusterExec) {
        try {
            const start = performance.now();
            const res = await fetch(TARGET_URL, { signal: AbortSignal.timeout(1500) });
            const duration = (performance.now() - start).toFixed(1);
            if (res.ok) {
                const data = await res.json();
                return { ok: true, data, duration, method: 'HTTP' };
            }
        } catch (_) {
            useClusterExec = true;
        }
    }

    // In-cluster query through kubectl exec (Minikube internal service DNS)
    try {
        const start = performance.now();
        const raw = execSync('kubectl exec -n workspace-booking deploy/booking-app-postgres -- wget -qO- http://booking-app/api/version', {
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf-8',
            timeout: 5000
        });
        const duration = (performance.now() - start).toFixed(1);
        const data = JSON.parse(raw.trim());
        return { ok: true, data, duration, method: 'In-Cluster DNS' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function testCanarySplit() {
    const versionCounts = {};
    const instanceCounts = {};
    let successful = 0;
    let failed = 0;

    for (let i = 1; i <= TOTAL_REQUESTS; i++) {
        const result = await queryVersion();
        if (result.ok) {
            const version = result.data.version || 'unknown';
            const instance = result.data.instance || 'unknown';

            versionCounts[version] = (versionCounts[version] || 0) + 1;
            instanceCounts[instance] = (instanceCounts[instance] || 0) + 1;
            successful++;

            console.log(`[#${i.toString().padStart(2, ' ')}] Version: ${version.padEnd(8, ' ')} | Pod: ${instance.padEnd(28, ' ')} | Latency: ${result.duration}ms (${result.method})`);
        } else {
            console.log(`[#${i.toString().padStart(2, ' ')}] Error: ${result.error || 'Failed'}`);
            failed++;
        }
        await new Promise(r => setTimeout(r, 120));
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
