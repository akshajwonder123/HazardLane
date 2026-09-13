import { ProviderError } from './contracts';

/** Minimal structural subset of Cloudflare D1 used by the shared weather quota. */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<{ success?: boolean; meta?: { changes?: number }; results?: T[] }>;
  first<T = unknown>(): Promise<T | null>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface WeatherBudget {
  reserve(units: number): Promise<void>;
  block(until: number): Promise<void>;
}

const ID = 'open-meteo';
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// The WHERE clause is the admission decision. SQLite evaluates this UPSERT as one
// transaction, so concurrent Worker instances cannot both spend the same capacity.
const RESERVE_SQL = `
INSERT INTO weather_budget (id, minute_start, minute_used, hour_start, hour_used, day_start, day_used, blocked_until)
VALUES (?, ?, ?, ?, ?, ?, ?, 0)
ON CONFLICT(id) DO UPDATE SET
  minute_start = CASE WHEN excluded.minute_start - weather_budget.minute_start >= ${MINUTE_MS} THEN excluded.minute_start ELSE weather_budget.minute_start END,
  minute_used = CASE WHEN excluded.minute_start - weather_budget.minute_start >= ${MINUTE_MS} THEN excluded.minute_used ELSE weather_budget.minute_used + excluded.minute_used END,
  hour_start = CASE WHEN excluded.hour_start - weather_budget.hour_start >= ${HOUR_MS} THEN excluded.hour_start ELSE weather_budget.hour_start END,
  hour_used = CASE WHEN excluded.hour_start - weather_budget.hour_start >= ${HOUR_MS} THEN excluded.hour_used ELSE weather_budget.hour_used + excluded.hour_used END,
  day_start = CASE WHEN excluded.day_start - weather_budget.day_start >= ${DAY_MS} THEN excluded.day_start ELSE weather_budget.day_start END,
  day_used = CASE WHEN excluded.day_start - weather_budget.day_start >= ${DAY_MS} THEN excluded.day_used ELSE weather_budget.day_used + excluded.day_used END
WHERE weather_budget.blocked_until <= excluded.minute_start
  AND (CASE WHEN excluded.minute_start - weather_budget.minute_start >= ${MINUTE_MS} THEN 0 ELSE weather_budget.minute_used END) + excluded.minute_used <= 500
  AND (CASE WHEN excluded.hour_start - weather_budget.hour_start >= ${HOUR_MS} THEN 0 ELSE weather_budget.hour_used END) + excluded.hour_used <= 4000
  AND (CASE WHEN excluded.day_start - weather_budget.day_start >= ${DAY_MS} THEN 0 ELSE weather_budget.day_used END) + excluded.day_used <= 8000`;

const BLOCK_SQL = `
INSERT INTO weather_budget (id, minute_start, minute_used, hour_start, hour_used, day_start, day_used, blocked_until)
VALUES (?, ?, 0, ?, 0, ?, 0, ?)
ON CONFLICT(id) DO UPDATE SET
  blocked_until = MAX(weather_budget.blocked_until, excluded.blocked_until)`;

const READ_SQL = `SELECT minute_start, minute_used, hour_start, hour_used, day_start, day_used, blocked_until
FROM weather_budget WHERE id = ?`;

interface BudgetRow {
  minute_start: number;
  minute_used: number;
  hour_start: number;
  hour_used: number;
  day_start: number;
  day_used: number;
  blocked_until: number;
}

function unavailable(): ProviderError {
  return new ProviderError('unavailable', 'Shared weather quota storage is unavailable.');
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

function retryAt(row: BudgetRow, at: number, units: number): number | null {
  const windows: Array<[number, number, number]> = [
    [row.minute_start, row.minute_used, MINUTE_MS],
    [row.hour_start, row.hour_used, HOUR_MS],
    [row.day_start, row.day_used, DAY_MS],
  ];
  const caps = [500, 4000, 8000];
  if (!validTime(row.blocked_until)) return null;
  let deadline = row.blocked_until > at ? row.blocked_until : 0;
  for (let index = 0; index < windows.length; index++) {
    const [start, used, duration] = windows[index];
    if (!validTime(start) || !Number.isSafeInteger(used) || used < 0 || used > caps[index] || start > at) return null;
    if (at - start < duration && used + units > caps[index]) deadline = Math.max(deadline, start + duration);
  }
  return deadline > at && validTime(deadline) ? deadline : null;
}

export function createD1WeatherBudget(db: D1Database, now: () => number = Date.now): WeatherBudget {
  async function execute(sql: string, values: unknown[]) {
    if (!db || typeof db.prepare !== 'function') throw unavailable();
    try {
      const result = await db.prepare(sql).bind(...values).run();
      if (result.success === false) throw unavailable();
      return result;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw unavailable();
    }
  }

  async function deniedRetryAt(at: number, units: number): Promise<number> {
    if (!db || typeof db.prepare !== 'function') throw unavailable();
    try {
      const row = await db.prepare(READ_SQL).bind(ID).first<BudgetRow>();
      const deadline = row && retryAt(row, at, units);
      if (!deadline) throw unavailable();
      return deadline;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw unavailable();
    }
  }

  return {
    async reserve(units: number) {
      if (!Number.isInteger(units) || units < 1 || units > 192) throw new RangeError('Weather quota units must be an integer from 1 to 192.');
      const at = now();
      if (!validTime(at)) throw unavailable();
      const result = await execute(RESERVE_SQL, [ID, at, units, at, units, at, units]);
      const changes = result.meta?.changes;
      if (typeof changes !== 'number' || !Number.isInteger(changes) || changes < 0 || changes > 1) throw unavailable();
      if (changes === 0) {
        throw new ProviderError('rate-limited', 'The weather provider request limit has been reached. Please try again shortly.', await deniedRetryAt(at, units));
      }
    },
    async block(until: number) {
      const at = now();
      if (!validTime(at) || !validTime(until)) throw unavailable();
      const result = await execute(BLOCK_SQL, [ID, at, at, at, until]);
      if (result.meta?.changes !== 1) throw unavailable();
    },
  };
}
