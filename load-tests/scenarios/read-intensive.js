// load-tests/scenarios/read-intensive.js
// Scenario A: Read-Intensive (ЛР5 п. 2.1)
// Висока частота читання каталогів, навантаження на Cache Layer (Redis), пам'ять та зчитування з БД.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, stagingStages, defaultThresholds, jsonHeaders, getRandomItem } from '../config.js';

// Користувацькі метрики продуктивності
export const cacheHitRate = new Rate('cache_hit_rate');
export const cacheMissRate = new Rate('cache_miss_rate');
export const readDuration = new Trend('read_duration_ms');

export const options = {
    stages: stagingStages,
    thresholds: {
        ...defaultThresholds,
        'cache_hit_rate': ['rate>0.80'], // Очікуємо > 80% Cache Hit Rate при прогрітому кеші
    },
};

// Фаза ініціалізації: створюємо тестового користувача для читання /bookings/my та перевіряємо воркспейси
export function setup() {
    // Реєструємо тестового користувача для перевірки читання моїх бронювань
    const userPayload = JSON.stringify({
        full_name: 'Read Scenario Benchmark User',
        email: `read_bench_${Date.now()}@loadtest.local`
    });

    const regRes = http.post(`${BASE_URL}/api/users/register`, userPayload, { headers: jsonHeaders });
    let testUserId = null;
    if (regRes.status === 201) {
        testUserId = JSON.parse(regRes.body).id;
    }

    // Перевіряємо наявність воркспейсів
    const wsRes = http.get(`${BASE_URL}/api/workspaces`, { headers: jsonHeaders });
    let workspaces = [];
    if (wsRes.status === 200) {
        workspaces = JSON.parse(wsRes.body);
    }

    // Якщо воркспейси відсутні, створюємо базовий набір
    if (!workspaces || workspaces.length === 0) {
        const types = ['desk', 'meeting_room', 'phone_booth'];
        for (let i = 1; i <= 6; i++) {
            http.post(`${BASE_URL}/api/workspaces`, JSON.stringify({
                name: `Load Test Workspace ${i}`,
                type: types[(i - 1) % types.length],
                status: 'active'
            }), { headers: jsonHeaders });
        }
    }

    return { testUserId };
}

export default function (data) {
    const types = ['', '?type=desk', '?type=meeting_room', '?type=phone_booth'];
    const selectedFilter = getRandomItem(types);

    // 1. Читання каталогу робочих місць (Cache-Aside через Redis)
    const url = `${BASE_URL}/api/workspaces${selectedFilter}`;
    const res = http.get(url, { headers: jsonHeaders });

    const isOk = check(res, {
        'status is 200': (r) => r.status === 200,
        'has response body': (r) => r.body && r.body.length > 0,
    });

    if (isOk) {
        readDuration.add(res.timings.duration);

        // Фіксуємо X-Cache заголовок (HIT vs MISS / BYPASS)
        const cacheHeader = res.headers['X-Cache'] || res.headers['x-cache'];
        if (cacheHeader === 'HIT') {
            cacheHitRate.add(1);
            cacheMissRate.add(0);
        } else if (cacheHeader === 'MISS' || cacheHeader === 'BYPASS') {
            cacheHitRate.add(0);
            cacheMissRate.add(1);
        }
    }

    // 2. Періодичне читання персональних бронювань (вибірка по індексу з БД)
    if (data && data.testUserId && Math.random() < 0.25) {
        const myRes = http.get(`${BASE_URL}/api/bookings/my?user_id=${data.testUserId}`, { headers: jsonHeaders });
        check(myRes, {
            'bookings/my status is 200': (r) => r.status === 200,
        });
    }

    // Симуляція реалістичної затримки користувача (15 - 50 мс)
    sleep(0.02);
}

