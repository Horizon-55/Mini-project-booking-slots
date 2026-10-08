import express, { Request, Response, NextFunction } from 'express';
import os from 'os';
import { router as apiRoutes } from './routers/routers';
import { pool } from './db';

const app = express();
app.use(express.json());

// ДОДАНО: Глобальний middleware для ідентифікації екземпляра (Stateless requirement)
app.use((req: Request, res: Response, next: NextFunction) => {
    // os.hostname() у Docker повертає унікальний ID контейнера
    res.setHeader('X-Instance-ID', os.hostname());
    next();
});

// Підключення всіх ендпоінтів з префіксом /api
app.use('/api', apiRoutes);

app.get('/api/health', async (req: Request, res: Response) => {
    try {
        const dbResult = await pool.query('SELECT NOW()');
        res.json({
            status: 'ok',
            timestamp: dbResult.rows[0].now,
            instance: os.hostname() // Також зручно повертати в тілі health-чеку
        });
    } catch (error) {
        res.status(500).json({ error: 'Помилка підключення до бази даних' });
    }
});

// Глобальний обробник виняткових ситуацій
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err.name === 'ZodError') {
        return res.status(400).json({ error: 'Помилка валідації', details: err.errors });
    }
    console.error('Unhandled Error:', err.message || err);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT} (Instance ID: ${os.hostname()})`);
});