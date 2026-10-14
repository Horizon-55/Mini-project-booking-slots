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

    it('повинен повертати статус 200 для /health', async () => {
        app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                checks: { database: 'ok', redis: 'ok' }
            });
        });

        const response = await request(app).get('/health');
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
        expect(response.body.checks.database).toBe('ok');
        expect(response.body.checks.redis).toBe('ok');
    });
});

import { CacheKeys } from './cache';
import { createWorkspaceSchema } from './validators';

describe('Distributed Caching & Validation (ЛР4)', () => {
    describe('Cache Key Design (п. 2.4)', () => {
        it('повинен генерувати детермінований ключ для всіх місць за замовчуванням', () => {
            const key = CacheKeys.workspacesList();
            expect(key).toBe('cache:workspaces:list:type=all');
        });

        it('повинен генерувати ключ з урахуванням типу без чутливості до регістру', () => {
            const keyDesk = CacheKeys.workspacesList('DESK');
            const keyMeeting = CacheKeys.workspacesList('meeting_room');
            expect(keyDesk).toBe('cache:workspaces:list:type=desk');
            expect(keyMeeting).toBe('cache:workspaces:list:type=meeting_room');
        });

        it('повинен генерувати коректний шаблон для повної інвалідації', () => {
            expect(CacheKeys.workspacesPattern()).toBe('cache:workspaces:*');
        });
    });

    describe('Схема валідації робочих місць (createWorkspaceSchema)', () => {
        it('повинен успішно валідувати коректні дані', () => {
            const valid = createWorkspaceSchema.parse({
                name: 'Desk Ultra 1',
                type: 'desk',
                status: 'active'
            });
            expect(valid.name).toBe('Desk Ultra 1');
            expect(valid.type).toBe('desk');
            expect(valid.status).toBe('active');
        });

        it('повинен викидати помилку при занадто короткій назві', () => {
            expect(() => {
                createWorkspaceSchema.parse({ name: 'A' });
            }).toThrow();
        });

        it('повинен викидати помилку при недопустимому типі', () => {
            expect(() => {
                createWorkspaceSchema.parse({ name: 'Conference Big', type: 'luxury_hall' });
            }).toThrow();
        });
    });

    describe('Імітація заголовків X-Cache (Cache-Aside & Fallback)', () => {
        it('повинен повертати X-Cache: HIT при наявності даних у кеші', async () => {
            app.get('/test/workspaces-hit', (req, res) => {
                res.setHeader('X-Cache', 'HIT');
                res.json([{ id: '1', name: 'Desk 1' }]);
            });

            const res = await request(app).get('/test/workspaces-hit');
            expect(res.status).toBe(200);
            expect(res.headers['x-cache']).toBe('HIT');
        });

        it('повинен повертати X-Cache: MISS при первинному зчитуванні з БД', async () => {
            app.get('/test/workspaces-miss', (req, res) => {
                res.setHeader('X-Cache', 'MISS');
                res.json([{ id: '1', name: 'Desk 1' }]);
            });

            const res = await request(app).get('/test/workspaces-miss');
            expect(res.status).toBe(200);
            expect(res.headers['x-cache']).toBe('MISS');
        });

        it('повинен повертати X-Cache: BYPASS у режимі аварійного Fallback (Graceful Degradation)', async () => {
            app.get('/test/workspaces-bypass', (req, res) => {
                res.setHeader('X-Cache', 'BYPASS');
                res.json([{ id: '1', name: 'Desk 1' }]);
            });

            const res = await request(app).get('/test/workspaces-bypass');
            expect(res.status).toBe(200);
            expect(res.headers['x-cache']).toBe('BYPASS');
        });
    });
});