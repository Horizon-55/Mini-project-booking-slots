#!/usr/bin/env node
/**
 * Скрипт генератора навантаження для ЛР-7 (Observability & Automated Canary Rollout)
 * 
 * Генерує регулярний HTTP-трафік до застосунку для:
 * 1. Відображення на дашборді Grafana (RPS, 5xx error rate, p95 latency, CPU/RAM).
 * 2. Забезпечення активного потоку запитів для AnalysisTemplate в Argo Rollouts під час релізу.
 */

const TARGET_HOST = process.env.TARGET_HOST || 'http://127.0.0.1:30080';
const DURATION_SEC = parseInt(process.env.DURATION || '120', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);
const DELAY_BETWEEN_BATCH_MS = parseInt(process.env.DELAY_MS || '100', 10);

console.log('\n======================================================');
console.log('🚀 ГЕНЕРАТОР НАВАНТАЖЕННЯ (DevOps ЛР-7 Observability)');
console.log(`🎯 Цільова адреса: ${TARGET_HOST}`);
console.log(`⏱️  Тривалість: ${DURATION_SEC} сек | Конкурентність: ${CONCURRENCY}`);
console.log('======================================================\n');

let totalRequests = 0;
let successRequests = 0;
let errorRequests = 0;
let statusCounts = {};

const endpoints = [
    { method: 'GET', path: '/api/workspaces' },
    { method: 'GET', path: '/api/version' },
    { method: 'GET', path: '/health' }
];

async function sendRequest() {
    const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
    const url = `${TARGET_HOST}${ep.path}`;
    const start = performance.now();

    try {
        const res = await fetch(url, {
            method: ep.method,
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(3000)
        });
        const duration = performance.now() - start;

        totalRequests++;
        statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;

        if (res.ok) {
            successRequests++;
        } else {
            errorRequests++;
        }
    } catch (err) {
        totalRequests++;
        errorRequests++;
        statusCounts['ERROR'] = (statusCounts['ERROR'] || 0) + 1;
    }
}

async function run() {
    const startTime = Date.now();
    const endTime = startTime + DURATION_SEC * 1000;

    const printInterval = setInterval(() => {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const rps = (totalRequests / Math.max(1, (Date.now() - startTime) / 1000)).toFixed(1);
        const errRate = totalRequests > 0 ? ((errorRequests / totalRequests) * 100).toFixed(1) : '0.0';
        
        process.stdout.write(
            `\r[${elapsedSec}s] Запитів: ${totalRequests} | Успішно: ${successRequests} | Помилок: ${errorRequests} (${errRate}%) | RPS: ${rps} | Статуси: ${JSON.stringify(statusCounts)}  `
        );
    }, 1000);

    while (Date.now() < endTime) {
        const batch = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            batch.push(sendRequest());
        }
        await Promise.all(batch);
        if (DELAY_BETWEEN_BATCH_MS > 0) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCH_MS));
        }
    }

    clearInterval(printInterval);
    console.log('\n\n🏁 Тестування завершено!');
    console.log(`📊 Загалом запитів: ${totalRequests}`);
    console.log(`✅ Успішних: ${successRequests}`);
    console.log(`❌ Помилок: ${errorRequests}`);
    console.log(`📋 Розподіл статусів:`, statusCounts);
}

run().catch(console.error);
