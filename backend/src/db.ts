import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import type { Run, RunState, RunStep } from "@arkreen/a4a-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "a4a.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      agent_wallet TEXT NOT NULL,
      state TEXT NOT NULL,
      steps TEXT NOT NULL DEFAULT '[]',
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      offset_kwh REAL,
      token_id INTEGER,
      consecutive_failures INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      ts INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_kwh (
      date TEXT PRIMARY KEY,
      kwh REAL NOT NULL DEFAULT 0
    );
  `);
}

// ── Run helpers ────────────────────────────────────────────────────────────────

export interface RunRow {
  id: string;
  agent_wallet: string;
  state: RunState;
  steps: string;
  started_at: number;
  completed_at: number | null;
  offset_kwh: number | null;
  token_id: number | null;
  consecutive_failures: number;
}

function runToRow(run: Run): Omit<RunRow, "steps"> & { steps: string } {
  return {
    id: run.id,
    agent_wallet: run.agentWallet,
    state: run.state,
    steps: JSON.stringify(run.steps),
    started_at: run.startedAt,
    completed_at: run.completedAt ?? null,
    offset_kwh: run.offsetKwh ?? null,
    token_id: run.tokenId ?? null,
    consecutive_failures: run.consecutiveFailures,
  };
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    agentWallet: row.agent_wallet,
    strategy: "dca",
    state: row.state,
    steps: JSON.parse(row.steps) as RunStep[],
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    offsetKwh: row.offset_kwh ?? undefined,
    tokenId: row.token_id ?? undefined,
    consecutiveFailures: row.consecutive_failures,
  };
}

export function upsertRun(run: Run): void {
  const db = getDb();
  const row = runToRow(run);
  db.prepare(`
    INSERT OR REPLACE INTO runs
      (id, agent_wallet, state, steps, started_at, completed_at, offset_kwh, token_id, consecutive_failures)
    VALUES
      (@id, @agent_wallet, @state, @steps, @started_at, @completed_at, @offset_kwh, @token_id, @consecutive_failures)
  `).run(row);
}

export function getRuns(limit = 20): Run[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM runs ORDER BY started_at DESC LIMIT ?"
  ).all(limit) as RunRow[];
  return rows.map(rowToRun);
}

export function getRunById(id: string): Run | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
  return row ? rowToRun(row) : null;
}

// ── Alert helpers ──────────────────────────────────────────────────────────────

export interface AlertRow {
  id: number;
  level: string;
  message: string;
  ts: number;
}

export function insertAlert(level: string, message: string): AlertRow {
  const db = getDb();
  const ts = Date.now();
  const result = db.prepare(
    "INSERT INTO alerts (level, message, ts) VALUES (?, ?, ?)"
  ).run(level, message, ts);
  return { id: Number(result.lastInsertRowid), level, message, ts };
}

export function getRecentAlerts(limit = 50): AlertRow[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM alerts ORDER BY ts DESC LIMIT ?"
  ).all(limit) as AlertRow[];
}

// ── Daily kWh helpers ──────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDailyKwh(kwh: number): void {
  const db = getDb();
  const date = todayStr();
  db.prepare(`
    INSERT INTO daily_kwh (date, kwh) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET kwh = kwh + excluded.kwh
  `).run(date, kwh);
}

export function getTodayKwh(): number {
  const db = getDb();
  const row = db.prepare("SELECT kwh FROM daily_kwh WHERE date = ?").get(todayStr()) as
    | { kwh: number }
    | undefined;
  return row?.kwh ?? 0;
}

export function getTotalKwh(): number {
  const db = getDb();
  const row = db.prepare("SELECT SUM(kwh) as total FROM daily_kwh").get() as
    | { total: number | null }
    | undefined;
  return row?.total ?? 0;
}

export function getStreak(): number {
  const db = getDb();
  const rows = db.prepare(
    "SELECT date FROM daily_kwh WHERE kwh > 0 ORDER BY date DESC"
  ).all() as { date: string }[];

  if (rows.length === 0) return 0;

  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (const row of rows) {
    const d = new Date(row.date + "T00:00:00");
    const diff = Math.round((cursor.getTime() - d.getTime()) / 86400000);
    if (diff <= 1) {
      streak++;
      cursor = d;
    } else {
      break;
    }
  }
  return streak;
}
