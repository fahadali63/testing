// SQLite store for detected academic items (uses Node's built-in node:sqlite).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });
const db = new DatabaseSync(`${config.dataDir}/study.db`);

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT NOT NULL,
    course        TEXT,
    title         TEXT NOT NULL,
    date          TEXT,            -- YYYY-MM-DD
    time          TEXT,            -- HH:MM (24h)
    venue         TEXT,
    details       TEXT,
    importance    TEXT NOT NULL DEFAULT 'medium',
    status        TEXT NOT NULL DEFAULT 'active',   -- active | cancelled
    group_name    TEXT,
    source_text   TEXT,
    calendar_event_id TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS processed_messages (
    msg_id TEXT PRIMARY KEY
  );
`);

export function alreadyProcessed(msgId) {
  if (!msgId) return false;
  const row = db.prepare("SELECT 1 FROM processed_messages WHERE msg_id = ?").get(msgId);
  if (row) return true;
  db.prepare("INSERT INTO processed_messages (msg_id) VALUES (?)").run(msgId);
  return false;
}

export function insertItem(item) {
  const r = db
    .prepare(
      `INSERT INTO items (type, course, title, date, time, venue, details, importance, group_name, source_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      item.type,
      item.course,
      item.title,
      item.date,
      item.time,
      item.venue,
      item.details,
      item.importance,
      item.group_name,
      item.source_text
    );
  return getItem(Number(r.lastInsertRowid));
}

export function updateItem(id, fields) {
  const allowed = ["type", "course", "title", "date", "time", "venue", "details", "importance", "status", "calendar_event_id"];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k) && fields[k] !== undefined);
  if (!keys.length) return getItem(id);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE items SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(
    ...keys.map((k) => fields[k]),
    id
  );
  return getItem(id);
}

export function getItem(id) {
  return db.prepare("SELECT * FROM items WHERE id = ?").get(id);
}

// Active items from `fromDate` onward, plus undated items from the last 14 days.
export function upcomingItems(fromDate, toDate) {
  return db
    .prepare(
      `SELECT * FROM items
       WHERE status = 'active'
         AND ((date >= ? AND date <= ?) OR (date IS NULL AND created_at >= datetime('now', '-14 days')))
       ORDER BY date IS NULL, date, time IS NULL, time`
    )
    .all(fromDate, toDate);
}

// Compact list used as context so Claude can match updates/cancellations to existing items.
export function recentActiveItems(fromDate) {
  return db
    .prepare(
      `SELECT id, type, course, title, date, time, venue FROM items
       WHERE status = 'active' AND (date IS NULL OR date >= ?)
       ORDER BY updated_at DESC LIMIT 40`
    )
    .all(fromDate);
}

export function itemsChangedInLastHours(hours) {
  return db
    .prepare("SELECT * FROM items WHERE updated_at >= datetime('now', ?) ORDER BY updated_at")
    .all(`-${hours} hours`);
}
