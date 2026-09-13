import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ProviderError } from '../server/contracts';
import { createD1WeatherBudget, type D1Database, type D1PreparedStatement } from '../server/weather-budget';

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE weather_budget (
    id TEXT PRIMARY KEY, minute_start INTEGER NOT NULL, minute_used INTEGER NOT NULL,
    hour_start INTEGER NOT NULL, hour_used INTEGER NOT NULL, day_start INTEGER NOT NULL,
    day_used INTEGER NOT NULL, blocked_until INTEGER NOT NULL
  )`);
  return db;
}

function d1(db: DatabaseSync): D1Database {
  return { prepare(query) {
    let values: unknown[] = [];
    const wrapped: ReturnType<D1Database['prepare']> = {
      bind(...next: unknown[]) { values = next; return wrapped; },
      async run() {
        const statement = db.prepare(query);
        statement.run(...values as any[]);
        return { success: true, meta: { changes: Number(db.prepare('SELECT changes() AS changes').get()?.changes ?? 0) } };
      },
      async first<T = unknown>() {
        return db.prepare(query).get(...values as any[]) as T | null;
      },
    };
    return wrapped;
  } };
}

function rateLimited(error: unknown): boolean { return error instanceof ProviderError && error.code === 'rate-limited'; }
async function retryAt(operation: () => Promise<void>): Promise<number> {
  try { await operation(); assert.fail('Expected a rate-limit error.'); }
  catch (error) { assert.ok(rateLimited(error)); return (error as ProviderError).retryAt!; }
}

test('shares minute capacity across instances and never overshoots it', async () => {
  const store = database(); let time = 1_000;
  const first = createD1WeatherBudget(d1(store), () => time);
  const second = createD1WeatherBudget(d1(store), () => time);
  await Promise.all([first.reserve(192), second.reserve(192)]);
  assert.equal(await retryAt(() => first.reserve(117)), 61_000);
  assert.equal(store.prepare('SELECT minute_used FROM weather_budget').get()?.minute_used, 384);
  store.close();
});

test('returns exact exhausted minute, hour, and day retry deadlines', async () => {
  const hourStore = database(); let time = 0;
  const hourly = createD1WeatherBudget(d1(hourStore), () => time);
  for (let index = 0; index < 20; index++) { await hourly.reserve(192); time += 61_000; }
  assert.equal(await retryAt(() => hourly.reserve(161)), 3_600_000);
  hourStore.close();

  const dayStore = database(); time = 0;
  const daily = createD1WeatherBudget(d1(dayStore), () => time);
  for (let hour = 0; hour < 2; hour++) {
    for (let index = 0; index < 20; index++) { await daily.reserve(192); time += 61_000; }
    time = (hour + 1) * 3_600_000;
  }
  await daily.reserve(192);
  assert.equal(await retryAt(() => daily.reserve(129)), 86_400_000);
  dayStore.close();
});

test('persists a 24-hour cooldown and keeps the furthest shared block deadline', async () => {
  const store = database(); let time = 10_000;
  const first = createD1WeatherBudget(d1(store), () => time);
  const second = createD1WeatherBudget(d1(store), () => time);
  await first.reserve(1);
  await first.block(time + 86_400_000);
  await second.block(time + 20_000);
  assert.equal(await retryAt(() => second.reserve(1)), 86_410_000);
  time = 86_410_000;
  await second.reserve(1);
  assert.equal(store.prepare('SELECT blocked_until, minute_used FROM weather_budget').get()?.blocked_until, 86_410_000);
  assert.equal(store.prepare('SELECT minute_used FROM weather_budget').get()?.minute_used, 1);
  store.close();
});

test('resets each rolling window from its own first admitted call', async () => {
  const store = database(); let time = 2_000;
  const budget = createD1WeatherBudget(d1(store), () => time);
  await budget.reserve(192); time += 60_000;
  await budget.reserve(192);
  assert.equal(store.prepare('SELECT minute_used FROM weather_budget').get()?.minute_used, 192);
  time += 3_600_000;
  await budget.reserve(192);
  const row = store.prepare('SELECT minute_used, hour_used FROM weather_budget').get() as { minute_used: number; hour_used: number };
  assert.equal(row.minute_used, 192); assert.equal(row.hour_used, 192);
  store.close();
});

test('fails closed when storage is missing or errors', async () => {
  const missing = createD1WeatherBudget(undefined as unknown as D1Database);
  await assert.rejects(() => missing.reserve(1), (error: unknown) => error instanceof ProviderError && error.code === 'unavailable');
  const broken: D1Database = { prepare() { throw new Error('storage failure'); } };
  await assert.rejects(() => createD1WeatherBudget(broken).reserve(1), (error: unknown) => error instanceof ProviderError && error.code === 'unavailable');
  const malformed: D1Database = { prepare() {
    const statement: D1PreparedStatement = {
      bind() { return statement; },
      async run<T = unknown>() { return { success: true, meta: { changes: 0 } } as { success?: boolean; meta?: { changes?: number }; results?: T[] }; },
      async first<T = unknown>() { return {} as T; },
    };
    return statement;
  } };
  const invalidStore = createD1WeatherBudget(malformed);
  await assert.rejects(() => invalidStore.reserve(1), (error: unknown) => error instanceof ProviderError && error.code === 'unavailable');
  await assert.rejects(() => invalidStore.block(10), (error: unknown) => error instanceof ProviderError && error.code === 'unavailable');
});

test('rejects invalid reservation units before touching storage', async () => {
  const budget = createD1WeatherBudget(d1(database()));
  for (const units of [0, -1, 1.5, 193, Number.NaN]) await assert.rejects(() => budget.reserve(units), RangeError);
});
