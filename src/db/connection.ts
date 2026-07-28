import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS products (
    product_id     TEXT PRIMARY KEY,
    product_name   TEXT NOT NULL,
    category       TEXT NOT NULL,
    brand          TEXT NOT NULL,
    price          REAL NOT NULL,
    original_price REAL,
    stock          INTEGER,
    rating         REAL,
    review_count   INTEGER,
    sales_volume   INTEGER,
    launch_date    TEXT,
    description    TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export function createConnection(dbPath: string): DatabaseSync {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  return new DatabaseSync(dbPath);
}

export function runMigrations(db: DatabaseSync): void {
  db.exec(CREATE_TABLE_SQL);
}

// Singleton for production use
let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    const dbPath = path.join(process.cwd(), 'data', 'products.db');
    _db = createConnection(dbPath);
    runMigrations(_db);
  }
  return _db;
}
