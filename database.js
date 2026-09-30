const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'cia_reports.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      callsign TEXT,
      role TEXT NOT NULL CHECK(role IN ('viewer', 'agent', 'admin')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_number TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reporter TEXT NOT NULL,
      reporter_callsign TEXT,
      unit_callsigns TEXT,
      location TEXT,
      classification TEXT DEFAULT 'CONFIDENTIAL',
      status TEXT DEFAULT 'OPEN',
      incident_date TEXT NOT NULL,
      incident_time TEXT NOT NULL,
      priority TEXT DEFAULT 'ROUTINE',
      tags TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS report_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      caption TEXT,
      uploaded_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      role TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_reports_number ON reports(report_number);
    CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(incident_date);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
  `);

  migrateRoles();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    seedDatabase();
  } else {
    ensureDefaultAccounts();
  }
}

function migrateRoles() {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!table?.sql || table.sql.includes("'agent'")) return;

  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      callsign TEXT,
      role TEXT NOT NULL CHECK(role IN ('viewer', 'agent', 'admin')),
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO users_new (id, username, password_hash, display_name, callsign, role, created_at)
    SELECT id, username, password_hash, display_name, callsign, role, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `);
  db.pragma('foreign_keys = ON');
}

function ensureDefaultAccounts() {
  db.prepare("UPDATE users SET role = 'agent' WHERE username = 'agent' AND role = 'viewer'").run();
  db.prepare("UPDATE users SET role = 'admin' WHERE username = 'full' AND role != 'admin'").run();

  const agent = db.prepare("SELECT * FROM users WHERE username = 'agent'").get();
  if (agent && bcrypt.compareSync('viewer123', agent.password_hash)) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync('agent123', 10), agent.id);
  }

  const viewer = db.prepare("SELECT id FROM users WHERE username = 'viewer'").get();
  if (!viewer) {
    const hash = bcrypt.hashSync('viewer123', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, display_name, callsign, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('viewer', hash, 'Intelligence Analyst', 'WATCHER-2', 'viewer');
  }

  const full = db.prepare("SELECT id FROM users WHERE username = 'full'").get();
  if (!full) {
    const hash = bcrypt.hashSync('full123', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, display_name, callsign, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('full', hash, 'Director Operations', 'OVERWATCH-1', 'admin');
  }

  giveAgentOwnSampleReport();
}

function seedDatabase() {
  const fullHash = bcrypt.hashSync('full123', 10);
  const agentHash = bcrypt.hashSync('agent123', 10);
  const viewerHash = bcrypt.hashSync('viewer123', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, callsign, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertUser.run('full', fullHash, 'Director Operations', 'OVERWATCH-1', 'admin');
  insertUser.run('agent', agentHash, 'Field Agent', 'SHADOW-7', 'agent');
  insertUser.run('viewer', viewerHash, 'Intelligence Analyst', 'WATCHER-2', 'viewer');

  const insertReport = db.prepare(`
    INSERT INTO reports (
      report_number, title, description, reporter, reporter_callsign,
      unit_callsigns, location, classification, status, incident_date,
      incident_time, priority, tags, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertReport.run(
    'CIA-2026-0001',
    'Surveillance Operation — Del Perro Pier',
    'Field team conducted covert surveillance on suspected foreign intelligence asset meeting with local contacts. Subject arrived at 2145 hrs via black Sedan. Two additional persons of interest observed. No hostile action taken. Asset departed northbound on Del Perro Freeway at 2230 hrs.',
    'Agent Mitchell',
    'SHADOW-3',
    JSON.stringify(['SHADOW-3', 'SHADOW-7', 'EAGLE-2']),
    'Del Perro Pier, Los Santos',
    'SECRET',
    'CLOSED',
    '2026-09-28',
    '21:45',
    'HIGH',
    JSON.stringify(['surveillance', 'foreign-asset', 'del-perro']),
    'Recommend continued monitoring. Subject vehicle plates forwarded to analysis division.',
    1
  );

  insertReport.run(
    'CIA-2026-0002',
    'Interagency Brief — Paleto Bay Incident',
    'Responding to anomalous radio traffic in Paleto Bay sector. Mobile unit dispatched for reconnaissance. Confirmed unauthorized military-grade equipment transfer at abandoned warehouse. Local LSPD notified under classified liaison protocol.',
    'Agent Reyes',
    'EAGLE-1',
    JSON.stringify(['EAGLE-1', 'EAGLE-4']),
    'Paleto Bay Industrial Zone',
    'TOP SECRET',
    'OPEN',
    '2026-09-29',
    '03:12',
    'CRITICAL',
    JSON.stringify(['weapons', 'paleto-bay', 'interagency']),
    'Awaiting forensic team deployment. Maintain 500m perimeter.',
    2
  );
}

function giveAgentOwnSampleReport() {
  const agent = db.prepare("SELECT id FROM users WHERE username = 'agent'").get();
  if (!agent) return;

  const owned = db.prepare('SELECT COUNT(*) as count FROM reports WHERE created_by = ?').get(agent.id).count;
  if (owned > 0) return;

  const paleto = db.prepare("SELECT id FROM reports WHERE report_number = 'CIA-2026-0002'").get();
  if (paleto) {
    db.prepare('UPDATE reports SET created_by = ? WHERE id = ?').run(agent.id, paleto.id);
  }
}

function getNextReportNumber() {
  const year = new Date().getFullYear();
  const prefix = `CIA-${year}-`;
  const last = db.prepare(`
    SELECT report_number FROM reports
    WHERE report_number LIKE ?
    ORDER BY id DESC LIMIT 1
  `).get(`${prefix}%`);

  let seq = 1;
  if (last) {
    const parts = last.report_number.split('-');
    seq = parseInt(parts[2], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function logActivity(req, action, details = null, extra = {}) {
  const user = extra.user || req.user || {};
  db.prepare(`
    INSERT INTO activity_logs (user_id, username, role, action, details, ip)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    extra.userId ?? user.id ?? null,
    extra.username ?? user.username ?? null,
    extra.role ?? user.role ?? null,
    action,
    details,
    extra.ip || clientIp(req)
  );
}

module.exports = { db, initDatabase, getNextReportNumber, logActivity, clientIp };
