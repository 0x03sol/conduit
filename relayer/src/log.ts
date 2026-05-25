import pino from "pino";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Singleton logger. Pretty-prints in development, JSON in production
 * (controlled by NODE_ENV).
 */
export function createLogger(level: LogLevel = "info"): pino.Logger {
    const transport =
        process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } }
            : undefined;
    return pino({ level, ...(transport ? { transport } : {}) });
}
