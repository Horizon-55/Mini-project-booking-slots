// load-tests/scenarios/complex-workflow.js
// Scenario C: Complex End-to-End Workflow (ЛР5 п. 2.1)
// Сквозний бізнес-сценарій: Пошук у каталозі -> Реєстрація -> Перевірка слотів -> Бронювання -> Скасування.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { 
    BASE_URL, 
    stagingStages, 
    defaultThresholds, 
    jsonHeaders, 
    getRandomItem, 
    generateRandomEmail, 
    generateBookingTimeSlot 
} from '../config.js';

// Метрики
export const workflowSuccessRate = new Rate('workflow_success_rate');
export const workflowDuration = new Trend('workflow_duration_ms');

export const options = {
    stages: stagingStages,
    thresholds: {
        ...defaultThresholds,
        'workflow_success_rate': ['rate>0.95'],
    },
};

export function setup() {
    const wsRes = http.get(`${BASE_URL}/api/workspaces`, { headers: jsonHeaders });
    let workspaces = [];
    if (wsRes.status === 200) {
        workspaces = JSON.parse(wsRes.body);
    }

    if (!workspaces || workspaces.length === 0) {
        for (let i = 1; i <= 4; i++) {
            const res = http.post(`${BASE_URL}/api/workspaces`, JSON.stringify({
                name: `Workflow Station ${i}`,
                type: 'desk',
                status: 'active'
            }), { headers: jsonHeaders });
            if (res.status === 201) workspaces.push(JSON.parse(res.body));
        }
    }

    return { workspaces };
}

export default function (data) {
    const startTime = Date.now();
    let workflowFailed = false;

    // КРОК 1: Перегляд доступних робочих місць (Read через Redis Cache-Aside)
    const browseRes = http.get(`${BASE_URL}/api/workspaces`, { headers: jsonHeaders });
    const browseOk = check(browseRes, {
        'step 1 - browse catalog ok': (r) => r.status === 200,
    });
    if (!browseOk) workflowFailed = true;

    sleep(0.02);

    // КРОК 2: Реєстрація нового користувача під сесію
    const email = generateRandomEmail(`flow_vu${__VU}`);
    const regRes = http.post(`${BASE_URL}/api/users/register`, JSON.stringify({
        full_name: `Flow Resident ${__VU}`,
        email
    }), { headers: jsonHeaders });

    let userId = null;
    const regOk = check(regRes, {
        'step 2 - user registered': (r) => r.status === 201,
    });
    if (regOk) {
        userId = JSON.parse(regRes.body).id;
    } else {
        workflowFailed = true;
    }

    sleep(0.02);

    // КРОК 3: Перевірка існуючих бронювань користувача
    if (userId) {
        const myRes = http.get(`${BASE_URL}/api/bookings/my?user_id=${userId}`, { headers: jsonHeaders });
        check(myRes, {
            'step 3 - checked my bookings': (r) => r.status === 200,
        });
    }

    sleep(0.02);

    // КРОК 4: Бронювання обраного робочого місця (Write + Distributed Lock)
    let bookingId = null;
    const workspace = getRandomItem(data.workspaces);

    if (userId && workspace) {
        const slot = generateBookingTimeSlot(15, 45);
        const bookRes = http.post(`${BASE_URL}/api/bookings`, JSON.stringify({
            user_id: userId,
            workspace_id: workspace.id,
            start_time: slot.start_time,
            end_time: slot.end_time
        }), { 
            headers: jsonHeaders,
            responseCallback: http.expectedStatuses(200, 201, 409)
        });

        const bookOk = check(bookRes, {
            'step 4 - booking handled (201 or 409)': (r) => r.status === 201 || r.status === 409,
        });

        if (bookRes.status === 201) {
            bookingId = JSON.parse(bookRes.body).id;
        } else if (!bookOk) {
            workflowFailed = true;
        }
    }

    sleep(0.02);

    // КРОК 5: Скасування бронювання (з вірогідністю 30% - життєвий цикл скасування)
    if (bookingId && Math.random() < 0.3) {
        const cancelRes = http.patch(`${BASE_URL}/api/bookings/${bookingId}/cancel`, null, { headers: jsonHeaders });
        check(cancelRes, {
            'step 5 - booking cancelled': (r) => r.status === 200,
        });
    }

    const elapsed = Date.now() - startTime;
    workflowDuration.add(elapsed);

    if (!workflowFailed) {
        workflowSuccessRate.add(1);
    } else {
        workflowSuccessRate.add(0);
    }

    sleep(0.03);
}

