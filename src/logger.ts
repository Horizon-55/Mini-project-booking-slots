import os from 'os';

export interface StructuredLog {
    time: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    method?: string;
    route?: string;
    status?: number;
    duration_ms?: number;
    instance: string;
    version: string;
    error?: string;
    [key: string]: any;
}

const instanceId = os.hostname();
const appVersion = process.env.APP_VERSION || '1.0.0';

export function writeJsonLog(log: StructuredLog): void {
    const serialized = JSON.stringify(log);
    if (log.level === 'error') {
        process.stderr.write(serialized + '\n');
    } else {
        process.stdout.write(serialized + '\n');
    }
}

export const logger = {
    info(message: string, context: Record<string, any> = {}): void {
        writeJsonLog({
            time: new Date().toISOString(),
            level: 'info',
            message,
            instance: instanceId,
            version: process.env.APP_VERSION || appVersion,
            ...context
        });
    },
    warn(message: string, context: Record<string, any> = {}): void {
        writeJsonLog({
            time: new Date().toISOString(),
            level: 'warn',
            message,
            instance: instanceId,
            version: process.env.APP_VERSION || appVersion,
            ...context
        });
    },
    error(message: string, error?: any, context: Record<string, any> = {}): void {
        writeJsonLog({
            time: new Date().toISOString(),
            level: 'error',
            message,
            instance: instanceId,
            version: process.env.APP_VERSION || appVersion,
            error: error?.stack || error?.message || String(error),
            ...context
        });
    },
    http(method: string, route: string, status: number, duration_ms: number, context: Record<string, any> = {}): void {
        const isError = status >= 500;
        writeJsonLog({
            time: new Date().toISOString(),
            level: isError ? 'error' : 'info',
            message: `HTTP ${method} ${route} -> ${status}`,
            method,
            route,
            status,
            duration_ms: Math.round(duration_ms * 100) / 100,
            instance: instanceId,
            version: process.env.APP_VERSION || appVersion,
            ...context
        });
    }
};
