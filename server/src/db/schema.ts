import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  languages: text('languages').notNull().default('["en"]'),
  originalBusinessName: text('original_business_name').notNull(),
  originalDomain: text('original_domain').notNull(),
  dirPath: text('dir_path').notNull(),
  syncId: text('sync_id'),
  syncUpdatedAt: text('sync_updated_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const servers = sqliteTable('servers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull().default(22),
  panelType: text('panel_type').notNull(),
  panelPort: integer('panel_port'),
  username: text('username').notNull(),
  authType: text('auth_type').notNull().default('password'),
  password: text('password'),
  privateKey: text('private_key'),
  webRootPattern: text('web_root_pattern').notNull().default('/home/{{USER}}/web/{{DOMAIN}}/public_html'),
  panelUser: text('panel_user'),
  panelPassword: text('panel_password'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const sites = sqliteTable('sites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  domain: text('domain').notNull().unique(),
  businessName: text('business_name').notNull(),
  templateId: integer('template_id').references(() => templates.id),
  serverId: integer('server_id').references(() => servers.id),
  language: text('language').notNull().default('en'),
  status: text('status').notNull().default('pending'),
  deployStep: text('deploy_step'),
  deployLog: text('deploy_log'),
  errorMessage: text('error_message'),
  previewStatus: integer('preview_status'),
  previewUpdatedAt: text('preview_updated_at'),
  previewError: text('preview_error'),
  deployedAt: text('deployed_at'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
