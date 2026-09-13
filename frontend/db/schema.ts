import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';

// One provider-budget row. No users, coordinates, routes or forecast payloads.
export const weatherBudget=sqliteTable('weather_budget',{
  id:text('id').primaryKey(),
  minuteStart:integer('minute_start').notNull(),minuteUsed:integer('minute_used').notNull(),
  hourStart:integer('hour_start').notNull(),hourUsed:integer('hour_used').notNull(),
  dayStart:integer('day_start').notNull(),dayUsed:integer('day_used').notNull(),
  blockedUntil:integer('blocked_until').notNull(),
});
