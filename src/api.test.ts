import request from 'supertest';
import express from 'express';

// Створюємо мінімальний екземпляр додатку для тестування маршруту
const app = express();
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

describe('Integration Tests', () => {
    it('повинен повертати статус 200 та { status: "ok" } для /api/health', async () => {
        const response = await request(app).get('/api/health');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');
    });
});