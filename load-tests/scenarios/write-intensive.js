// load-tests/scenarios/write-intensive.js
// Scenario B: Write-Intensive (ЛР5 п. 2.1)
// Висока частота операцій запису: реєстрація користувачів, створення бронювань,
// перевірка транзакційних блокувань (Redis Distributed Lock) та I/O навантаження на PostgreSQL.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { 
    BASE_URL, 
    stagingStages, 
    defaultThresholds, 
    jsonHeaders, 
    getRandomItem, 
    generateRandomEmail, 
    generateBookingTimeSlot 
} from '../config.js';

// Користувацькі метрики
export const writeSuccessRate = new Rate('write_success_rate');
export const lockContentionRate = new Rate('lock_contention_rate'); // Частота 409 Conflict через блокування
export const serverErrorRate = new Rate('server_error_rate'); // Виключно 5xx помилки
export const writeDuration = new Trend('write_duration_ms');
export const totalBookingsCreated = new Counter('total_bookings_created');

export const options = {
    stages: stagingStages,
    thresholds: {
        'http_req_duration': ['p(95)<500', 'p(99)<1500'],
        // Під високим навантаженням очікуємо або 201 (успіх), або 409 (атомарний лок/конфлікт слоту)
        // Критерій відмови сервера: 5xx помилок має бути < 5%
        'server_error_rate': ['rate<0.05'],
    },
};

export function setup() {
    // 1. Отримуємо робочі місця
    const wsRes = http.get(`${BASE_URL}/api/workspaces`, { headers: jsonHeaders });
    let workspaces = [];
    if (wsRes.status === 200) {
        workspaces = JSON.parse(wsRes.body);
    }

    if (!workspaces || workspaces.length === 0) {
        for (let i = 1; i <= 5; i++) {
            const createRes = http.post(`${BASE_URL}/api/workspaces`, JSON.stringify({
                name: `Write Bench Desk ${i}`,
                type: 'desk',
                status: 'active'
            }), { headers: jsonHeaders });
            if (createRes.status === 201) {
                workspaces.push(JSON.parse(createRes.body));
            }
        }
    }

    // 2. Створюємо пул з 10 базових користувачів
    const users = [];
    for (let i = 0; i < 10; i++) {
        const uRes = http.post(`${BASE_URL}/api/users/register`, JSON.stringify({
            full_name: `Resident Benchmark ${i}`,
            email: generateRandomEmail(`bench_${i}`)
        }), { headers: jsonHeaders });

        if (uRes.status === 201) {
            users.push(JSON.parse(uRes.body));
        }
    }

    return { workspaces, users };
}

export default function (data) {
    const isRegistration = Math.random() < 0.30; // 30% реєстрації нових жителів, 70% бронювання слотів

    if (isRegistration) {
        // Реєстрація нового користувача (INSERT INTO users)
        const payload = JSON.stringify({
            full_name: `Resident ${__VU}_${__ITER}`,
            email: generateRandomEmail(`vu${__VU}`)
        });

        const res = http.post(`${BASE_URL}/api/users/register`, payload, { 
            headers: jsonHeaders,
            responseCallback: http.expectedStatuses(201, 409)
        });
        writeDuration.add(res.timings.duration);
        serverErrorRate.add(res.status >= 500 ? 1 : 0);

        check(res, {
            'registration created (201)': (r) => r.status === 201,
        });

        if (res.status === 201) {
            writeSuccessRate.add(1);
        } else {
            writeSuccessRate.add(0);
        }
    } else {
        // Бронювання робочого місця (Redis Distributed Lock + PostgreSQL Transaction)
        const workspace = getRandomItem(data.workspaces);
        const user = getRandomItem(data.users);

        if (!workspace || !user) {
            sleep(0.05);
            return;
        }

        // Генеруємо випадковий часовий слот у межах найближчих 2 годин
        const slot = generateBookingTimeSlot(10, 30);
        const bookingPayload = JSON.stringify({
            user_id: user.id,
            workspace_id: workspace.id,
            start_time: slot.start_time,
            end_time: slot.end_time
        });

        const res = http.post(`${BASE_URL}/api/bookings`, bookingPayload, { 
            headers: jsonHeaders,
            responseCallback: http.expectedStatuses(200, 201, 409)
        });
        writeDuration.add(res.timings.duration);

        const isCreated = res.status === 201;
        const isConflict = res.status === 409; // Лок Redis зайнятий або слот перетинається (коректна поведінка системи)
        const is5xx = res.status >= 500;
        serverErrorRate.add(is5xx ? 1 : 0);

        check(res, {
            'booking response valid (201 or 409)': (r) => r.status === 201 || r.status === 409,
        });

        if (isCreated) {
            totalBookingsCreated.add(1);
            writeSuccessRate.add(1);
            lockContentionRate.add(0);
        } else if (isConflict) {
            lockContentionRate.add(1);
            writeSuccessRate.add(1); // 409 є валідним бізнес-результатом при високій конкурентності за один слот
        } else {
            writeSuccessRate.add(0);
        }
    }

    // Симуляція інтервалу між запитами
    sleep(0.03);
}

