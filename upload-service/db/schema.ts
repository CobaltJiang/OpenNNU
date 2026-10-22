import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(), ip: text('ip').notNull(), created: integer('created').notNull(), used: integer('used').notNull().default(0),
});
export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(), created: integer('created').notNull(), state: text('state').notNull().default('pending'),
  metadata: text('metadata').notNull(), files: text('files').notNull(), receipt: text('receipt'),
});
