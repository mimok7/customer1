// Small gated logger: only logs when NEXT_PUBLIC_DEBUG === 'true' on client
const isBrowser = typeof window !== 'undefined';
const enabled = isBrowser && process.env.NEXT_PUBLIC_DEBUG === 'true';

function safeLog(method: 'log' | 'info' | 'warn' | 'error', args: any[]) {
    if (!enabled) return;
    // eslint-disable-next-line no-console
    console[method](...args);
}

export const logger = {
    debug: (...args: any[]) => safeLog('log', args),
    info: (...args: any[]) => safeLog('info', args),
    warn: (...args: any[]) => safeLog('warn', args),
    error: (...args: any[]) => safeLog('error', args),
};

export default logger;
