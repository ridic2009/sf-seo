import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'site-factory.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      languages TEXT NOT NULL DEFAULT '["en"]',
      original_business_name TEXT NOT NULL,
      original_domain TEXT NOT NULL,
      dir_path TEXT NOT NULL,
      sync_id TEXT,
      sync_updated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      panel_type TEXT NOT NULL,
      panel_port INTEGER,
      username TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'password',
      password TEXT,
      private_key TEXT,
      web_root_pattern TEXT NOT NULL DEFAULT '/home/{{USER}}/web/{{DOMAIN}}/public_html',
      panel_user TEXT,
      panel_password TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      business_name TEXT NOT NULL,
      template_id INTEGER REFERENCES templates(id),
      server_id INTEGER REFERENCES servers(id),
      language TEXT NOT NULL DEFAULT 'en',
      status TEXT NOT NULL DEFAULT 'pending',
      deploy_step TEXT,
      deploy_log TEXT,
      error_message TEXT,
      preview_status INTEGER,
      preview_updated_at TEXT,
      preview_error TEXT,
      deployed_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: add panel_password to servers if missing
  try {
    sqlite.exec(`ALTER TABLE servers ADD COLUMN panel_password TEXT`);
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE templates ADD COLUMN sync_id TEXT`);
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE templates ADD COLUMN sync_updated_at TEXT`);
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE sites ADD COLUMN deploy_step TEXT`);
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE sites ADD COLUMN deploy_log TEXT`);
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE sites ADD COLUMN preview_status INTEGER`);
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE sites ADD COLUMN preview_updated_at TEXT`);
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE sites ADD COLUMN preview_error TEXT`);
  } catch {
    // Column already exists
  }
}
