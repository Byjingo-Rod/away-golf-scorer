import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const reviews=sqliteTable('matchplay_reviews',{owner:text('owner').notNull(),id:text('id').notNull(),revision:integer('revision').notNull(),record:text('record').notNull()},t=>[primaryKey({columns:[t.owner,t.id]})]);
export const sessions=sqliteTable('matchplay_review_sessions',{tokenHash:text('token_hash').primaryKey(),owner:text('owner').notNull(),event:text('event').notNull(),role:text('role').notNull(),playerId:text('player_id'),expires:integer('expires').notNull()});
