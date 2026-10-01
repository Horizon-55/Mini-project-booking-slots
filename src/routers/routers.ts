import { Router, Request, Response, NextFunction } from 'express';
import { pool, redisClient } from '../db';
import { registerUserSchema, createBookingSchema } from '../validators';

export const router = Router();

// 1. Реєстрація нового резидента
router.post('/users/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = registerUserSchema.parse(req.body);
        const result = await pool.query(
            'INSERT INTO users (full_name, email) VALUES ($1, $2) RETURNING id, full_name, email',
            [data.full_name, data.email]
        );
        res.status(201).json(result.rows[0]);
    } catch (error: any) {
        if (error.code === '23505') return res.status(409).json({ error: 'Користувач з таким email вже існує' });
        next(error);
    }
});

// 2. Отримання списку вільних місць
router.get('/workspaces', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type } = req.query;
        let query = 'SELECT * FROM workspaces WHERE status = $1';
        const params: any[] = ['active'];

        if (type) {
            params.push(type);
            query += ` AND type = $2`;
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
});

// 3. Створення бронювання (High-Load Scenario з локуванням)
router.post('/bookings', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = createBookingSchema.parse(req.body);

        // Встановлюємо атомарний лок в Redis на 5 секунд
        const lockKey = `lock:workspace:${data.workspace_id}`;
        const acquiredLock = await redisClient.set(lockKey, 'locked', { NX: true, EX: 5 });

        if (!acquiredLock) {
            return res.status(409).json({ error: 'Це місце саме зараз бронює хтось інший. Спробуйте через мить.' });
        }

        try {
            const result = await pool.query(
                `INSERT INTO bookings (user_id, workspace_id, start_time, end_time) 
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [data.user_id, data.workspace_id, data.start_time, data.end_time]
            );
            res.status(201).json(result.rows[0]);
        } catch (dbError: any) {
            // Обробка винятку від БД (наприклад, спрацював EXCLUDE CONSTRAINT на перетин часу)
            if (dbError.code === '23P01') {
                return res.status(409).json({ error: 'На цей час місце вже заброньовано.' });
            }
            throw dbError;
        } finally {
            // Обов'язково знімаємо лок
            await redisClient.del(lockKey);
        }
    } catch (error) {
        next(error);
    }
});

// 4. Отримання бронювань користувача
router.get('/bookings/my', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { user_id } = req.query;
        if (!user_id) return res.status(400).json({ error: 'Потрібно передати user_id' });

        const result = await pool.query(
            'SELECT * FROM bookings WHERE user_id = $1 ORDER BY start_time DESC',
            [user_id]
        );
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
});

// 5. Скасування бронювання
router.patch('/bookings/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE bookings SET status = 'cancelled' WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rowCount === 0) return res.status(404).json({ error: 'Бронювання не знайдено' });
        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});