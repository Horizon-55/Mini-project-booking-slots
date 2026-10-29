// load-tests/config.js
// Базова конфігурація для навантажувальних сценаріїв k6 (Лабораторна робота № 5)

export const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:52945';

// Ступеневий профіль навантаження (Staging Ramp-Up) згідно з п. 2.3 методички:
// Warm-up (розігрів пулів та JIT) -> 10 VUs -> 50 VUs -> 100 VUs -> 200 VUs -> Cooldown
export const stagingStages = [
    { duration: '15s', target: 5 },    // Warm-up фаза (розігрів JIT, Connection Pool, Redis кешу)
    { duration: '30s', target: 10 },   // Рівень 1: 10 VUs (базове низьке навантаження)
    { duration: '30s', target: 50 },   // Рівень 2: 50 VUs (середнє навантаження)
    { duration: '30s', target: 100 },  // Рівень 3: 100 VUs (високе навантаження / наближення до Saturation Point)
    { duration: '30s', target: 200 },  // Рівень 4: 200 VUs (пікове стрес-навантаження / очікуваний тротлінг і черги)
    { duration: '15s', target: 0 },    // Cooldown / завершення тесту
];

// Швидкий профіль для експрес-валідації та порівняльних експериментів (A/B testing 1 vs 4 pods, Cold vs Warm)
export const benchmarkStages = [
    { duration: '10s', target: 10 },   // Розігрів
    { duration: '20s', target: 50 },   // Робоче навантаження 50 VUs
    { duration: '20s', target: 100 },  // Робоче навантаження 100 VUs
    { duration: '10s', target: 0 },    // Завершення
];

// SLA / Критерії успішності (Thresholds)
export const defaultThresholds = {
    // 95% запитів мають виконуватись швидше за 500мс, а 99% — швидше за 1500мс
    'http_req_duration': ['p(95)<500', 'p(99)<1500'],
    // Відсоток невдалих HTTP запитів (Error Rate) має бути менше 5% на стабільному рівні
    'http_req_failed': ['rate<0.05'],
};

// Заголовки запитів
export const jsonHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

// Допоміжні функції для генерації реалістичних тестових даних
export function getRandomItem(array) {
    if (!array || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
}

export function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateRandomEmail(prefix = 'resident') {
    const randomSuffix = Math.random().toString(36).substring(2, 9);
    const timestamp = Date.now();
    return `${prefix}_${timestamp}_${randomSuffix}@loadtest.local`;
}

export function generateBookingTimeSlot(futureMinutesOffset = 60, durationMinutes = 60) {
    const start = new Date(Date.now() + futureMinutesOffset * 60 * 1000 + getRandomInt(1, 1000) * 60 * 1000);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    return {
        start_time: start.toISOString(),
        end_time: end.toISOString()
    };
}

