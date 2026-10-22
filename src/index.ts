import express, { Request, Response, NextFunction } from 'express';
import os from 'os';
import { router as apiRoutes } from './routers/routers';
import { pool, redisClient } from './db';

const app = express();
app.use(express.json());

// Глобальний middleware для ідентифікації екземпляра (Stateless requirement)
app.use((req: Request, res: Response, next: NextFunction) => {
    // os.hostname() у Docker повертає унікальний ID контейнера
    res.setHeader('X-Instance-ID', os.hostname());
    next();
});

// Синтетична затримка для симуляції гетерогенного/деградованого вузла (ЛР3 п. 2.3.3)
const defaultDelayMs = Number(process.env.LATENCY_DELAY_MS) || 0;
app.use((req: Request, res: Response, next: NextFunction) => {
    // Можливість задати затримку через ENV (для конкретного контейнера) або через query param ?delay=
    const queryDelay = req.query.delay ? Number(req.query.delay) : null;
    const delay = queryDelay !== null && !isNaN(queryDelay) ? queryDelay : defaultDelayMs;

    // Не затримуємо health-check запити, щоб уникнути хибних спрацювань моніторингу
    if (delay > 0 && !req.path.endsWith('/health')) {
        setTimeout(next, delay);
    } else {
        next();
    }
});

// Підключення всіх ендпоінтів з префіксом /api
app.use('/api', apiRoutes);

// Health Check endpoint (ЛР3 п. 2.4.1) з комплексною перевіркою залежностей (DB + Redis)
const healthHandler = async (req: Request, res: Response) => {
    const checks: Record<string, string> = {
        database: 'down',
        redis: 'down'
    };
    let isHealthy = true;

    // 1. Перевірка PostgreSQL
    try {
        await pool.query('SELECT 1');
        checks.database = 'ok';
    } catch (dbError: any) {
        isHealthy = false;
        checks.database = `error: ${dbError.message || dbError}`;
    }

    // 2. Перевірка Redis
    try {
        const pong = await redisClient.ping();
        if (pong === 'PONG') {
            checks.redis = 'ok';
        } else {
            isHealthy = false;
            checks.redis = `unexpected response: ${pong}`;
        }
    } catch (redisError: any) {
        isHealthy = false;
        checks.redis = `error: ${redisError.message || redisError}`;
    }

    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json({
        status: isHealthy ? 'ok' : 'degraded',
        version: process.env.APP_VERSION || '1.0.0',
        instance: os.hostname(),
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        latencyDelayMs: defaultDelayMs,
        checks
    });
};

// Версіонування застосунку (DevOps ЛР-5 п. 2.b)
const versionHandler = (req: Request, res: Response) => {
    res.json({
        version: process.env.APP_VERSION || '1.0.0',
        instance: os.hostname(),
        environment: process.env.NODE_ENV || 'development'
    });
};

// Доступно як за прямим шляхом, так і через /api
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);
app.get('/version', versionHandler);
app.get('/api/version', versionHandler);

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