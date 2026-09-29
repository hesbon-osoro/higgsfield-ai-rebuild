import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const generationKind = pgEnum('generation_kind', ['IMAGE', 'VIDEO']);
export const generationStatus = pgEnum('generation_status', ['PROCESSING', 'SUCCEEDED', 'FAILED']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Guest users are created on first visit; a real auth provider would attach
  // an identity to this same row rather than creating a new one.
  isGuest: boolean('is_guest').notNull().default(true),
  displayName: text('display_name'),
  credits: integer('credits').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Binary blobs (generated images, uploaded start frames). Kept in Postgres so
// the demo has a single stateful dependency; swap for object storage at scale.
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  bytes: bytea('bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  source: text('source').notNull(), // 'generated' | 'upload'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const generations = pgTable(
  'generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').notNull(),
    kind: generationKind('kind').notNull(),
    status: generationStatus('status').notNull().default('PROCESSING'),
    prompt: text('prompt').notNull(),
    engine: text('engine').notNull(),
    engineWasAuto: boolean('engine_was_auto').notNull().default(false),
    aspect: text('aspect').notNull(),
    seed: integer('seed').notNull(),
    motionPreset: text('motion_preset'),
    durationSec: integer('duration_sec'),
    // Video start frame: an asset (uploaded or generated keyframe).
    startFrameAssetId: uuid('start_frame_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    // The generation this one was animated or remixed from, for lineage.
    parentId: uuid('parent_id'),
    outputAssetId: uuid('output_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    // External job tracking: the provider's job id and its last reported
    // queue state, refreshed (throttled) whenever the client polls.
    providerJobId: text('provider_job_id'),
    queuePosition: integer('queue_position'),
    etaSec: integer('eta_sec'),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    cost: integer('cost').notNull(),
    error: text('error'),
    favorite: boolean('favorite').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('generations_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('generations_published_idx')
      .on(t.publishedAt.desc())
      .where(sql`${t.publishedAt} is not null`),
  ],
);

// Append-only credit ledger. users.credits is the running balance, updated in
// the same transaction as each ledger row.
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(), // 'starter' | 'generation' | 'refund' | 'top_up'
    note: text('note'),
    batchId: uuid('batch_id'),
    balanceAfter: integer('balance_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('credit_ledger_user_created_idx').on(t.userId, t.createdAt.desc())],
);

export type User = typeof users.$inferSelect;
export type Generation = typeof generations.$inferSelect;
export type LedgerEntry = typeof creditLedger.$inferSelect;
