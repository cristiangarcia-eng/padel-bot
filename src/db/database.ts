import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS blocked_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS partidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      creator_phone TEXT NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      notified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partido_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partido_id INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      player_phone TEXT NOT NULL,
      is_sports_member INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_partido_player_unique
      ON partido_players(partido_id, player_phone);

    CREATE INDEX IF NOT EXISTS idx_partidos_date
      ON partidos(slot_date);
  `);

  // Migration: add milestone notification columns
  const cols = db.pragma('table_info(partidos)') as { name: string }[];
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('notified_2')) {
    db.exec('ALTER TABLE partidos ADD COLUMN notified_2 INTEGER NOT NULL DEFAULT 0');
  }
  if (!colNames.includes('notified_3')) {
    db.exec('ALTER TABLE partidos ADD COLUMN notified_3 INTEGER NOT NULL DEFAULT 0');
  }

  // Migration: add player level column
  const playerCols = db.pragma('table_info(partido_players)') as { name: string }[];
  const playerColNames = playerCols.map(c => c.name);
  if (!playerColNames.includes('level')) {
    db.exec("ALTER TABLE partido_players ADD COLUMN level TEXT NOT NULL DEFAULT ''");
  }
}
