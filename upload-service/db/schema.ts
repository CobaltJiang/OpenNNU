import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(), ip: text('ip').notNull(), created: integer('created').notNull(), used: integer('used').notNull().default(0),
});
export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(), created: integer('created').notNull(), state: text('state').notNull().default('pending'),
  metadata: text('metadata').notNull(), files: text('files').notNull(), receipt: text('receipt'),
});
export const maintainers = sqliteTable('maintainers', {
  userId:text('user_id').primaryKey(),email:text('email').notNull(),role:text('role').notNull(),
  active:integer('active').notNull().default(1),created:integer('created').notNull(),createdBy:text('created_by').notNull(),
});
export const reviews = sqliteTable('reviews', {
  submissionId:text('submission_id').primaryKey(),version:integer('version').notNull(),
  metadata:text('metadata').notNull(),actor:text('actor').notNull(),updated:integer('updated').notNull(),
});
export const reviewAudit = sqliteTable('review_audit', {
  id:text('id').primaryKey(),actor:text('actor').notNull(),action:text('action').notNull(),
  target:text('target').notNull(),detail:text('detail').notNull(),created:integer('created').notNull(),
});
export const publishJobs = sqliteTable('publish_jobs', {
  id:text('id').primaryKey(),submissionId:text('submission_id').notNull(),state:text('state').notNull(),
  tokenHash:text('token_hash').notNull(),expires:integer('expires').notNull(),actor:text('actor').notNull(),
  review:text('review').notNull(),created:integer('created').notNull(),receipt:text('receipt'),error:text('error'),
});
