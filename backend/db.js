const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'mhskyhub.sqlite');

const DEFAULT_CHAT_SEAT = '14A';
const DEFAULT_REQUESTS = [
  { id: 9001, seat: '22C', type: 'assist', item: 'Blanket', qty: 1, note: 'Extra soft if available', status: 'inprogress', eta: 120, icon: '🛏', priority: 'normal', timestamp: Date.now() - 3 * 60000 },
  { id: 9002, seat: '08B', type: 'order', item: 'Water', qty: 2, note: '', status: 'new', eta: 180, icon: '💧', priority: 'normal', timestamp: Date.now() - 1 * 60000 },
  { id: 9003, seat: '31F', type: 'assist', item: 'Cleaning', qty: 1, note: 'Spill at seat', status: 'inprogress', eta: 60, icon: '🧹', priority: 'urgent', timestamp: Date.now() - 5 * 60000 },
  { id: 9004, seat: '05A', type: 'assist', item: 'Headset', qty: 1, note: '', status: 'completed', eta: 0, icon: '🎧', priority: 'done', timestamp: Date.now() - 8 * 60000 }
];
const DEFAULT_CHAT_MESSAGES = [
  { seat: DEFAULT_CHAT_SEAT, from: 'crew', text: 'Good afternoon! How can I assist you today?', timestamp: Date.now() - 3 * 60000 },
  { seat: DEFAULT_CHAT_SEAT, from: 'passenger', text: 'Could I get an extra pillow please?', timestamp: Date.now() - 2 * 60000 },
  { seat: DEFAULT_CHAT_SEAT, from: 'crew', text: "Of course! I'll bring that right over. Anything else?", timestamp: Date.now() - 1 * 60000 }
];

let db;

function ensureDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new sqlite3.Database(DB_PATH);
  return db;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    ensureDb().run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    ensureDb().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    ensureDb().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function normalizeSeat(seat) {
  return String(seat || DEFAULT_CHAT_SEAT).trim().toUpperCase();
}

function hasUsableIcon(icon) {
  const value = String(icon || '').trim();
  return Boolean(value) && !/^(?:\?+|\uFFFD+)$/u.test(value) && !/[\u00C3\u00C2\u00E2\u00F0]/u.test(value);
}

function inferRequestIcon(request) {
  const item = String((request && request.item) || '').trim().toLowerCase();
  const type = String((request && request.type) || '').trim().toLowerCase();

  if (item.includes('teh tarik') || item.includes('coffee') || item.includes('tea') || item.includes('hot drink')) return '\u2615';
  if (item.includes('water')) return '\uD83D\uDCA7';
  if (item.includes('juice')) return '\uD83E\uDDC3';
  if (item.includes('blanket') || item.includes('pillow')) return '\uD83D\uDECF';
  if (item.includes('cleaning') || item.includes('spill')) return '\uD83E\uDDF9';
  if (item.includes('headset') || item.includes('headphone')) return '\uD83C\uDFA7';
  if (item.includes('medical') || item.includes('medicine')) return '\uD83D\uDC8A';
  if (item.includes('child') || item.includes('baby')) return '\uD83D\uDC76';
  if (item.includes('toiletries')) return '\uD83E\uDDF4';
  if (item.includes('accessibility')) return '\u267F';
  if (type === 'order') return '\u2615';
  if (type === 'assist') return '\uD83D\uDECE';
  return '\u2615';
}

function resolveRequestIcon(request) {
  if (hasUsableIcon(request && request.icon)) return String(request.icon).trim();
  return inferRequestIcon(request);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function mapChatRow(row) {
  return {
    id: row.id,
    seat: row.seat,
    from: row.from_role,
    text: row.text,
    timestamp: row.timestamp
  };
}

function mapRequestRow(row) {
  return {
    id: row.id,
    seat: row.seat,
    type: row.type,
    item: row.item,
    qty: row.qty,
    note: row.note || '',
    status: row.status,
    timestamp: row.timestamp,
    updatedAt: row.updated_at,
    eta: row.eta,
    icon: resolveRequestIcon(row),
    priority: row.priority || ''
  };
}

async function seedUsers() {
  const row = await get('SELECT COUNT(*) AS count FROM users');
  if (row && row.count > 0) return;

  const demoUsers = [
    {
      username: process.env.DEMO_CREW_USERNAME || 'crew',
      password: process.env.DEMO_CREW_PASSWORD || 'mhcrew123',
      role: 'crew',
      seat: null
    },
    {
      username: process.env.DEMO_PASSENGER_USERNAME || 'passenger14a',
      password: process.env.DEMO_PASSENGER_PASSWORD || 'mhpass123',
      role: 'passenger',
      seat: DEFAULT_CHAT_SEAT
    }
  ];

  for (const user of demoUsers) {
    await run(
      'INSERT INTO users (username, password_hash, role, seat) VALUES (?, ?, ?, ?)',
      [user.username, hashPassword(user.password), user.role, user.seat]
    );
  }
}

async function seedChatMessages() {
  const row = await get('SELECT COUNT(*) AS count FROM chat_messages');
  if (row && row.count > 0) return;

  for (const message of DEFAULT_CHAT_MESSAGES) {
    await run(
      'INSERT INTO chat_messages (seat, from_role, text, timestamp) VALUES (?, ?, ?, ?)',
      [normalizeSeat(message.seat), message.from, message.text, message.timestamp]
    );
  }
}

async function seedRequests() {
  const row = await get('SELECT COUNT(*) AS count FROM service_requests');
  if (row && row.count > 0) return;

  for (const request of DEFAULT_REQUESTS) {
    await run(
      `INSERT INTO service_requests
      (id, seat, type, item, qty, note, status, timestamp, updated_at, eta, icon, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.id,
        normalizeSeat(request.seat),
        request.type,
        request.item,
        request.qty,
        request.note,
        request.status,
        request.timestamp,
        request.timestamp,
        request.eta,
        request.icon,
        request.priority
      ]
    );
  }
}

async function repairRequestIcons() {
  const rows = await all(
    `SELECT id, seat, type, item, qty, note, status, timestamp, updated_at, eta, icon, priority
     FROM service_requests`
  );

  for (const row of rows) {
    const nextIcon = resolveRequestIcon(row);
    if (nextIcon !== String(row.icon || '')) {
      await run('UPDATE service_requests SET icon = ?, updated_at = ? WHERE id = ?', [
        nextIcon,
        Date.now(),
        row.id
      ]);
    }
  }
}

async function initDb() {
  ensureDb();

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      seat TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seat TEXT NOT NULL,
      from_role TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id INTEGER PRIMARY KEY,
      seat TEXT NOT NULL,
      type TEXT NOT NULL,
      item TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      status TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      eta INTEGER NOT NULL DEFAULT 0,
      icon TEXT,
      priority TEXT
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_chat_messages_seat ON chat_messages(seat, timestamp)');
  await run('CREATE INDEX IF NOT EXISTS idx_service_requests_seat ON service_requests(seat, timestamp)');

  await seedUsers();
  await seedChatMessages();
  await seedRequests();
  await repairRequestIcons();
}

async function findUserByUsername(username) {
  return get('SELECT id, username, password_hash, role, seat FROM users WHERE username = ?', [username]);
}

async function listChatMessages(seat) {
  const rows = await all(
    'SELECT id, seat, from_role, text, timestamp FROM chat_messages WHERE seat = ? ORDER BY timestamp ASC',
    [normalizeSeat(seat)]
  );
  return rows.map(mapChatRow);
}

async function listChatThreads() {
  const rows = await all(
    'SELECT id, seat, from_role, text, timestamp FROM chat_messages ORDER BY timestamp ASC'
  );

  const grouped = new Map();
  rows.forEach(row => {
    const seat = normalizeSeat(row.seat);
    if (!grouped.has(seat)) grouped.set(seat, []);
    grouped.get(seat).push(row);
  });

  return Array.from(grouped.entries())
    .map(([seat, messages]) => {
      const last = messages[messages.length - 1];
      return {
        seat,
        messageCount: messages.length,
        updatedAt: last.timestamp,
        lastFrom: last.from_role,
        lastText: last.text
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

async function createChatMessage({ seat, from, text, timestamp }) {
  const createdAt = Number(timestamp || Date.now());
  const result = await run(
    'INSERT INTO chat_messages (seat, from_role, text, timestamp) VALUES (?, ?, ?, ?)',
    [normalizeSeat(seat), from, String(text).trim(), createdAt]
  );

  return {
    id: result.id,
    seat: normalizeSeat(seat),
    from,
    text: String(text).trim(),
    timestamp: createdAt
  };
}

async function listRequests(filters = {}) {
  const params = [];
  let sql = `
    SELECT id, seat, type, item, qty, note, status, timestamp, updated_at, eta, icon, priority
    FROM service_requests
  `;

  if (filters.seat) {
    sql += ' WHERE seat = ?';
    params.push(normalizeSeat(filters.seat));
  }

  sql += ' ORDER BY timestamp DESC';

  const rows = await all(sql, params);
  return rows.map(mapRequestRow);
}

async function getRequestById(id) {
  const row = await get(
    `SELECT id, seat, type, item, qty, note, status, timestamp, updated_at, eta, icon, priority
     FROM service_requests WHERE id = ?`,
    [id]
  );
  return row ? mapRequestRow(row) : null;
}

async function upsertRequest(request) {
  const now = Date.now();
  const payload = {
    id: Number(request.id || now),
    seat: normalizeSeat(request.seat),
    type: request.type || 'assist',
    item: request.item || 'Request',
    qty: Number(request.qty || 1),
    note: request.note || '',
    status: request.status || 'new',
    timestamp: Number(request.timestamp || now),
    updatedAt: Number(request.updatedAt || now),
    eta: Number(request.eta || 0),
    icon: resolveRequestIcon(request),
    priority: request.priority || (request.type === 'assist' && request.item === 'Medical' ? 'urgent' : 'normal')
  };

  await run(
    `INSERT INTO service_requests
      (id, seat, type, item, qty, note, status, timestamp, updated_at, eta, icon, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      seat = excluded.seat,
      type = excluded.type,
      item = excluded.item,
      qty = excluded.qty,
      note = excluded.note,
      status = excluded.status,
      timestamp = excluded.timestamp,
      updated_at = excluded.updated_at,
      eta = excluded.eta,
      icon = excluded.icon,
      priority = excluded.priority`,
    [
      payload.id,
      payload.seat,
      payload.type,
      payload.item,
      payload.qty,
      payload.note,
      payload.status,
      payload.timestamp,
      payload.updatedAt,
      payload.eta,
      payload.icon,
      payload.priority
    ]
  );

  return getRequestById(payload.id);
}

async function updateRequest(id, patch) {
  const existing = await getRequestById(id);
  if (!existing) return null;

  const merged = {
    ...existing,
    ...patch,
    id: existing.id,
    seat: normalizeSeat((patch && patch.seat) || existing.seat),
    updatedAt: Date.now()
  };

  return upsertRequest(merged);
}

module.exports = {
  DB_PATH,
  DEFAULT_CHAT_SEAT,
  hashPassword,
  initDb,
  findUserByUsername,
  listChatMessages,
  listChatThreads,
  createChatMessage,
  listRequests,
  getRequestById,
  upsertRequest,
  updateRequest
};
