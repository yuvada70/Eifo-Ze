/**
 * לוגר מינימלי בפורמט JSON-per-line.
 *
 * פורמט מובנה מאפשר איסוף בכלי ניטור (Datadog / CloudWatch / Loki)
 * ללא תלות בספריית צד שלישי.
 */

/** רמות חומרה, מהנמוכה לגבוהה. */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;

const activeLevel: LogLevel = (process.env['LOG_LEVEL'] as LogLevel) ?? 'info';

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[activeLevel]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...context,
  };

  const line = JSON.stringify(entry, (_key, value) =>
    value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value,
  );

  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
  /** יוצר לוגר עם הקשר קבוע (למשל קוד חדר) המצורף לכל רשומה. */
  child(base: Record<string, unknown>) {
    return {
      debug: (m: string, c?: Record<string, unknown>) => write('debug', m, { ...base, ...c }),
      info: (m: string, c?: Record<string, unknown>) => write('info', m, { ...base, ...c }),
      warn: (m: string, c?: Record<string, unknown>) => write('warn', m, { ...base, ...c }),
      error: (m: string, c?: Record<string, unknown>) => write('error', m, { ...base, ...c }),
    };
  },
};

export type Logger = typeof logger;
