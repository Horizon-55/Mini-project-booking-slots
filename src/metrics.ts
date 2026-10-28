import client from 'prom-client';

// Enable default runtime metrics (heap, cpu, event loop lag, etc.)
client.collectDefaultMetrics({ prefix: 'booking_app_' });

// Counter for HTTP requests (Low cardinality: method, route, status)
export const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests processed',
    labelNames: ['method', 'route', 'status'] as const
});

// Histogram for HTTP request duration in seconds
export const httpRequestDurationSeconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

export const register = client.register;

/**
 * Normalizes request paths to avoid high-cardinality label explosion in Prometheus.
 * E.g., /api/bookings/14/cancel -> /api/bookings/:id/cancel
 */
export function normalizePath(path: string): string {
    if (!path) return 'unknown';
    // Strip trailing slash
    const cleaned = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
    
    // Replace numeric IDs or UUIDs with :id parameter placeholder
    return cleaned
        .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
        .replace(/\/\d+(?=\/|$)/g, '/:id');
}

