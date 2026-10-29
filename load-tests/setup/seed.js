// load-tests/setup/seed.js
// Скрипт попередньої ініціалізації даних для навантажувальних тестів (Node.js або k6)

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:30080';

async function makeRequest(path, method, body) {
    const url = new URL(path, BASE_URL);
    return new Promise((resolve, reject) => {
        const req = http.request(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function seed() {
    console.log(`[Seed] Ініціалізація тестового середовища на ${BASE_URL}...`);

    const initialWorkspaces = [
        { name: 'Hot Desk Alfa-1', type: 'desk', status: 'active' },
        { name: 'Hot Desk Alfa-2', type: 'desk', status: 'active' },
        { name: 'Hot Desk Beta-1', type: 'desk', status: 'active' },
        { name: 'Silent Booth 1', type: 'phone_booth', status: 'active' },
        { name: 'Silent Booth 2', type: 'phone_booth', status: 'active' },
        { name: 'Conference Hub Prime', type: 'meeting_room', status: 'active' },
    ];

    for (const ws of initialWorkspaces) {
        try {
            const res = await makeRequest('/api/workspaces', 'POST', ws);
            if (res.status === 201) {
                console.log(`[Seed] Створено місце: ${ws.name} (${ws.type})`);
            }
        } catch (e) {
            console.warn(`[Seed] Помилка створення ${ws.name}:`, e.message);
        }
    }

    console.log('[Seed] Базові сутності готові до навантаження.');
}

seed().catch(err => {
    console.error('[Seed Error]:', err);
});

