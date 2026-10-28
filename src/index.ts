import express, { Request, Response, NextFunction } from 'express';
import os from 'os';
import { router as apiRoutes } from './routers/routers';
import { pool, redisClient } from './db';
import { httpRequestsTotal, httpRequestDurationSeconds, register, normalizePath } from './metrics';
import { logger } from './logger';

const app = express();
app.use(express.json());

// Глобальний middleware для ідентифікації екземпляра (Stateless requirement)
app.use((req: Request, res: Response, next: NextFunction) => {
    // os.hostname() у Docker повертає унікальний ID контейнера
    res.setHeader('X-Instance-ID', os.hostname());
    next();
});

// Middleware для збору метрик (Prometheus) та структурованого JSON-логування (Loki)
app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = process.hrtime();
    const route = normalizePath(req.baseUrl + req.path);

    res.on('finish', () => {
        const diff = process.hrtime(startTime);
        const durationSeconds = diff[0] + diff[1] / 1e9;
        const durationMs = durationSeconds * 1000;
        const status = res.statusCode.toString();

        // Не спамимо метриками/логами на опитування /metrics якщо не потрібно, але фіксуємо все інше
        httpRequestsTotal.inc({
            method: req.method,
            route,
            status
        });
        httpRequestDurationSeconds.observe({
            method: req.method,
            route,
            status
        }, durationSeconds);

        // Пишемо структурований JSON у stdout для Grafana Alloy -> Loki
        logger.http(req.method, route, res.statusCode, durationMs);
    });

    next();
});

// Симуляція відмови (ЛР7 п. 6.b: FAIL_RATE)
const failRate = parseFloat(process.env.FAIL_RATE || '0');
app.use((req: Request, res: Response, next: NextFunction) => {
    const isProbe = req.path.endsWith('/health') || req.path.endsWith('/metrics');
    if (!isProbe && failRate > 0 && Math.random() < failRate) {
        logger.error(`Simulated Failure triggered (FAIL_RATE=${failRate})`, undefined, {
            route: req.path,
            method: req.method
        });
        return res.status(500).json({
            error: 'Internal Server Error (Simulated Failure via FAIL_RATE)',
            failRate,
            version: process.env.APP_VERSION || '1.0.0'
        });
    }
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
        if (delay > 0 && !req.path.endsWith('/health') && !req.path.endsWith('/metrics')) {
            setTimeout(next, delay);
        } else {
            next();
        }
    });

// Підключення всіх ендпоінтів з префіксом /api
app.use('/api', apiRoutes);

// Ендпоінт метрик для Prometheus (ЛР7 п. 2.a)
const metricsHandler = async (_req: Request, res: Response) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
};
app.get('/metrics', metricsHandler);
app.get('/api/metrics', metricsHandler);

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
    logger.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT} (Instance ID: ${os.hostname()})`);
    logger.info(`Server started on port ${PORT}`, { port: PORT });
});
