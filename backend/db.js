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

const DEFAULT_SERVICE_MENU_ITEMS = [
  { slug: 'teh_tarik', category: 'hot_drinks', name: 'Teh Tarik', description: "Malaysian pulled milk tea, rich, frothy, and comforting at cruising altitude.", priceLabel: 'Complimentary', icon: '\u2615', sortOrder: 10 },
  { slug: 'kopi_o', category: 'hot_drinks', name: 'Kopi O', description: "Traditional Malaysian black coffee with a bold roast and clean finish.", priceLabel: 'Complimentary', icon: '\u2615', sortOrder: 20 },
  { slug: 'english_breakfast_tea', category: 'hot_drinks', name: 'English Breakfast Tea', description: "A classic full-bodied tea blend inspired by timeless London tea service.", priceLabel: 'Complimentary', icon: '\uD83C\uDF75', sortOrder: 30 },
  { slug: 'americano', category: 'hot_drinks', name: 'Americano', description: "Freshly brewed espresso topped with hot water for a smooth, bold cup.", priceLabel: 'Complimentary', icon: '\u2615', sortOrder: 40 },
  { slug: 'hot_chocolate', category: 'hot_drinks', name: 'Hot Chocolate', description: "Rich cocoa with a silky finish, ideal for winding down mid-flight.", priceLabel: 'Complimentary', icon: '\uD83C\uDF6B', sortOrder: 50 },
  { slug: 'green_tea', category: 'hot_drinks', name: 'Green Tea', description: "A light, soothing tea selection for a calm and refreshing break.", priceLabel: 'Complimentary', icon: '\uD83C\uDF75', sortOrder: 60 },

  { slug: 'teh_ais', category: 'cold_drinks', name: 'Teh Ais', description: "Chilled Malaysian milk tea served over ice with a balanced sweetness.", priceLabel: 'Complimentary', icon: '\uD83E\uDDC3', sortOrder: 110 },
  { slug: 'sirap_bandung', category: 'cold_drinks', name: 'Sirap Bandung', description: "Rose syrup with milk, a nostalgic Malaysian favourite with a rosy finish.", priceLabel: 'Complimentary', icon: '\uD83E\uDDC3', sortOrder: 120 },
  { slug: 'iced_milo', category: 'cold_drinks', name: 'Iced Milo', description: "A chilled chocolate malt drink loved across Malaysia for its creamy taste.", priceLabel: 'Complimentary', icon: '\uD83E\uDDC3', sortOrder: 130 },
  { slug: 'calamansi_cooler', category: 'cold_drinks', name: 'Calamansi Cooler', description: "A crisp citrus refresher with a bright, zesty Malaysian twist.", priceLabel: 'Complimentary', icon: '\uD83C\uDF4B', sortOrder: 140 },
  { slug: 'sparkling_water', category: 'cold_drinks', name: 'Sparkling Water', description: "Lightly sparkling mineral water for a clean and refreshing sip.", priceLabel: 'Complimentary', icon: '\uD83D\uDCA7', sortOrder: 150 },
  { slug: 'orange_juice', category: 'cold_drinks', name: 'Orange Juice', description: "Bright and familiar, served chilled and easy to enjoy any time.", priceLabel: 'Complimentary', icon: '\uD83C\uDF4A', sortOrder: 160 },
  { slug: 'cloudy_apple_juice', category: 'cold_drinks', name: 'Cloudy Apple Juice', description: "A crisp apple juice inspired by classic British cafe favourites.", priceLabel: 'Complimentary', icon: '\uD83C\uDF4E', sortOrder: 170 },
  { slug: 'ginger_ale', category: 'cold_drinks', name: 'Ginger Ale', description: "A light fizzy mixer with gentle spice and a London lounge feel.", priceLabel: 'Complimentary', icon: '\uD83E\uDD64', sortOrder: 180 },
  { slug: 'elderflower_lemon_fizz', category: 'cold_drinks', name: 'Elderflower Lemon Fizz', description: "A floral sparkling refreshment inspired by modern London cafe menus.", priceLabel: 'Complimentary', icon: '\uD83E\uDD64', sortOrder: 190 },
  { slug: 'english_breakfast_iced_tea', category: 'cold_drinks', name: 'English Breakfast Iced Tea', description: "A chilled black tea with a refined finish and a classic British profile.", priceLabel: 'Complimentary', icon: '\uD83E\uDDC3', sortOrder: 200 },

  { slug: 'maggi_cup', category: 'snacks', name: 'Maggi Cup', description: "A warm instant noodle cup that is always welcome on a long journey.", priceLabel: 'Complimentary', icon: '\uD83C\uDF5C', sortOrder: 210 },
  { slug: 'malaysia_airlines_peanuts', category: 'snacks', name: 'Malaysia Airlines Roasted Peanuts', description: "The iconic inflight peanuts that many passengers still look forward to.", priceLabel: 'Complimentary', icon: '\uD83E\uDD5C', sortOrder: 220 },
  { slug: 'biscoff_biscuits', category: 'snacks', name: 'Biscoff Biscuits', description: "A caramelised biscuit that feels right at home on any flight tray.", priceLabel: 'Complimentary', icon: '\uD83C\uDF6A', sortOrder: 230 },
  { slug: 'butter_crackers', category: 'snacks', name: 'Butter Crackers', description: "Light savoury crackers served for easy snacking between services.", priceLabel: 'Complimentary', icon: '\uD83E\uDD68', sortOrder: 240 },
  { slug: 'salted_pretzels', category: 'snacks', name: 'Salted Pretzels', description: "A crunchy cabin classic with just the right touch of salt.", priceLabel: 'Complimentary', icon: '\uD83E\uDD68', sortOrder: 250 },
  { slug: 'chocolate_wafer', category: 'snacks', name: 'Chocolate Wafer', description: "Crisp wafer layers with a smooth chocolate centre.", priceLabel: 'Complimentary', icon: '\uD83C\uDF6B', sortOrder: 260 },
  { slug: 'mixed_nuts', category: 'snacks', name: 'Mixed Nuts', description: "A simple savoury mix for passengers who want something hearty and light.", priceLabel: 'Complimentary', icon: '\uD83E\uDD5C', sortOrder: 270 },
  { slug: 'banana_chips', category: 'snacks', name: 'Banana Chips', description: "A crunchy tropical snack with a familiar Southeast Asian touch.", priceLabel: 'Complimentary', icon: '\uD83C\uDF4C', sortOrder: 280 },
  { slug: 'dried_fruit_mix', category: 'snacks', name: 'Dried Fruit Mix', description: "A lighter sweet option with apricot, raisin, and tropical fruit notes.", priceLabel: 'Complimentary', icon: '\uD83C\uDF47', sortOrder: 290 },
  { slug: 'sweet_salty_popcorn', category: 'snacks', name: 'Sweet & Salty Popcorn', description: "A movie-time favourite for relaxed viewing in the seatback screen.", priceLabel: 'Complimentary', icon: '\uD83C\uDF7F', sortOrder: 300 },

  { slug: 'nasi_lemak_signature', category: 'meals', name: 'Nasi Lemak Signature', description: "Fragrant coconut rice with sambal, anchovies, peanuts, and classic condiments.", priceLabel: 'Included', icon: '\uD83C\uDF5B', sortOrder: 310 },
  { slug: 'nasi_lemak_prawn_sambal', category: 'meals', name: 'Nasi Lemak Prawn Sambal', description: "Malaysia's signature coconut rice paired with sambal prawns and traditional accompaniments.", priceLabel: 'Included', icon: '\uD83E\uDD90', sortOrder: 320 },
  { slug: 'nasi_lemak_chicken_rendang', category: 'meals', name: 'Nasi Lemak Chicken Rendang', description: "A hearty nasi lemak served with slow-cooked chicken rendang rich in spices and coconut.", priceLabel: 'Included', icon: '\uD83C\uDF57', sortOrder: 330 },
  { slug: 'nasi_lemak_mushroom_rendang', category: 'meals', name: 'Nasi Lemak Mushroom Rendang', description: "A vegetarian nasi lemak with savoury mushroom rendang and warming aromatic spices.", priceLabel: 'Included', icon: '\uD83C\uDF44', sortOrder: 340 },
  { slug: 'nasi_daging_gerang', category: 'meals', name: 'Nasi Daging Gerang', description: "Beef served with richly seasoned rice in a robust Malaysian-style preparation.", priceLabel: 'Included', icon: '\uD83E\uDD69', sortOrder: 350 },
  { slug: 'laksa_johor', category: 'meals', name: 'Laksa Johor', description: "Johor-style laksa with a deeply flavoured fish-based gravy and satisfying noodles.", priceLabel: 'Included', icon: '\uD83C\uDF5C', sortOrder: 360 },
  { slug: 'ayam_sambal_bali', category: 'meals', name: 'Ayam Sambal Bali', description: "Tender chicken coated in a lively sambal with bold sweet-spicy notes.", priceLabel: 'Included', icon: '\uD83C\uDF57', sortOrder: 370 },
  { slug: 'ikan_percik', category: 'meals', name: 'Ikan Percik', description: "Grilled fish finished with coconut spice marinade in a beloved east coast style.", priceLabel: 'Included', icon: '\uD83D\uDC1F', sortOrder: 380 },
  { slug: 'malai_tandoori_chicken', category: 'meals', name: 'Malai Tandoori Chicken', description: "A creamy, gently spiced tandoori chicken with aromatic Indian-inspired notes.", priceLabel: 'Included', icon: '\uD83C\uDF57', sortOrder: 390 },
  { slug: 'grilled_snapper', category: 'meals', name: 'Grilled Snapper', description: "A lighter seafood option with delicate seasoning and a refined presentation.", priceLabel: 'Included', icon: '\uD83D\uDC1F', sortOrder: 400 },
  { slug: 'grilled_beef_medallion', category: 'meals', name: 'Grilled Beef Medallion', description: "A premium beef selection with classic Western inflight dining appeal.", priceLabel: 'Included', icon: '\uD83E\uDD69', sortOrder: 410 },
  { slug: 'scallop_and_prawn_fettucine', category: 'meals', name: 'Scallop and Prawn Fettucine', description: "Fettuccine tossed with scallops and prawns for a rich seafood pasta course.", priceLabel: 'Included', icon: '\uD83C\uDF5D', sortOrder: 420 },
  { slug: 'wild_mushroom_ragout_penne', category: 'meals', name: 'Wild Mushroom Ragout Penne', description: "Penne pasta in a savoury mushroom ragout, hearty and fully vegetarian.", priceLabel: 'Included', icon: '\uD83C\uDF5D', sortOrder: 430 },
  { slug: 'rainbow_rice_with_shahi_paneer', category: 'meals', name: 'Rainbow Rice with Shahi Paneer', description: "Colourful rice paired with a creamy paneer dish inspired by royal North Indian flavours.", priceLabel: 'Included', icon: '\uD83C\uDF5B', sortOrder: 440 },
  { slug: 'lemon_mascarpone_tortellini', category: 'meals', name: 'Lemon Mascarpone Tortellini', description: "Soft tortellini with a bright citrus cream profile and a smooth finish.", priceLabel: 'Included', icon: '\uD83C\uDF5D', sortOrder: 450 },
  { slug: 'grilled_paneer_tikka', category: 'meals', name: 'Grilled Paneer Tikka', description: "Paneer grilled with aromatic spices for a vegetarian meal with depth and warmth.", priceLabel: 'Included', icon: '\uD83E\uDD58', sortOrder: 460 },
  { slug: 'teochew_steamed_fish', category: 'meals', name: 'Teochew Steamed Fish', description: "A delicate Chinese-style fish dish with light seasoning and comforting broth notes.", priceLabel: 'Included', icon: '\uD83D\uDC1F', sortOrder: 470 },
  { slug: 'hand_pulled_noodles', category: 'meals', name: 'Hand Pulled Noodles', description: "A satisfying noodle favourite served in a warming savoury style.", priceLabel: 'Included', icon: '\uD83C\uDF5C', sortOrder: 480 },
  { slug: 'wantan_noodles', category: 'meals', name: 'Wantan Noodles', description: "Springy noodles with wantan in a familiar Cantonese-style comfort bowl.", priceLabel: 'Included', icon: '\uD83C\uDF5C', sortOrder: 490 },
  { slug: 'strawberry_cinnamon_loaf', category: 'meals', name: 'Strawberry Cinnamon Loaf', description: "A soft sweet loaf with berry notes and a warm cinnamon finish.", priceLabel: 'Included', icon: '\uD83C\uDF5E', sortOrder: 500 },

  { slug: 'plush_blanket', category: 'comfort_items', name: 'Plush Blanket', description: "An extra cabin blanket for warmth during rest or overnight sectors.", priceLabel: 'Complimentary', icon: '\uD83D\uDECF', sortOrder: 510 },
  { slug: 'extra_pillow', category: 'comfort_items', name: 'Extra Pillow', description: "Additional neck or lumbar support to make your seat more comfortable.", priceLabel: 'Complimentary', icon: '\uD83D\uDECF', sortOrder: 520 },
  { slug: 'eye_mask', category: 'comfort_items', name: 'Eye Mask', description: "A simple sleep aid for passengers who want a darker, calmer cabin experience.", priceLabel: 'Complimentary', icon: '\uD83D\uDE34', sortOrder: 530 },
  { slug: 'cabin_slippers', category: 'comfort_items', name: 'Cabin Slippers', description: "Soft slippers to make moving around the cabin more relaxed.", priceLabel: 'Complimentary', icon: '\uD83E\uDE74', sortOrder: 540 },
  { slug: 'warm_towel', category: 'comfort_items', name: 'Warm Towel', description: "A refreshing warm towel for a quick comfort reset between services.", priceLabel: 'Complimentary', icon: '\uD83E\uDDFB', sortOrder: 550 },
  { slug: 'amenity_kit', category: 'comfort_items', name: 'Amenity Kit', description: "Useful inflight essentials for longer journeys and overnight comfort.", priceLabel: 'Complimentary', icon: '\uD83E\uDDF3', sortOrder: 560 },
  { slug: 'lumbar_cushion', category: 'comfort_items', name: 'Lumbar Cushion', description: "Extra lower-back support for a more comfortable seated posture.", priceLabel: 'Complimentary', icon: '\uD83E\uDE91', sortOrder: 570 },

  { slug: 'noise_cancelling_headset', category: 'accessories', name: 'Noise-Cancelling Headset', description: "A replacement headset for movies, music, and a quieter journey.", priceLabel: 'Complimentary', icon: '\uD83C\uDFA7', sortOrder: 610 },
  { slug: 'usb_c_cable', category: 'accessories', name: 'USB-C Charging Cable', description: "A cabin loan cable for charging compatible phones and tablets.", priceLabel: 'Complimentary', icon: '\uD83D\uDD0C', sortOrder: 620 },
  { slug: 'lightning_cable', category: 'accessories', name: 'Lightning Cable', description: "A charging cable for Apple devices when your own cable is tucked away.", priceLabel: 'Complimentary', icon: '\uD83D\uDD0C', sortOrder: 630 },
  { slug: 'universal_power_adapter', category: 'accessories', name: 'Universal Power Adapter', description: "A travel adapter to help keep devices powered during the flight.", priceLabel: 'Complimentary', icon: '\uD83D\uDD0C', sortOrder: 640 },
  { slug: 'pen_and_landing_card_kit', category: 'accessories', name: 'Pen & Landing Card Kit', description: "A pen and paper pack for forms, notes, and quick travel admin.", priceLabel: 'Complimentary', icon: '\uD83D\uDD8A', sortOrder: 650 },
  { slug: 'kids_activity_pack', category: 'accessories', name: 'Kids Activity Pack', description: "Simple inflight activities to help younger travellers stay engaged.", priceLabel: 'Complimentary', icon: '\uD83C\uDFA8', sortOrder: 660 },
  { slug: 'dental_kit', category: 'accessories', name: 'Dental Kit', description: "A toothbrush and toothpaste set for a quick freshen-up before arrival.", priceLabel: 'Complimentary', icon: '\uD83E\uDE65', sortOrder: 670 }
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

function mapMenuRow(row) {
  return {
    slug: row.slug,
    category: row.category,
    name: row.name,
    description: row.description || '',
    priceLabel: row.price_label || 'Included',
    icon: row.icon || '',
    sortOrder: row.sort_order || 0
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

async function syncServiceMenuItems() {
  for (const item of DEFAULT_SERVICE_MENU_ITEMS) {
    await run(
      `INSERT INTO service_menu_items
      (slug, category, name, description, price_label, icon, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        category = excluded.category,
        name = excluded.name,
        description = excluded.description,
        price_label = excluded.price_label,
        icon = excluded.icon,
        sort_order = excluded.sort_order`,
      [
        item.slug,
        item.category,
        item.name,
        item.description,
        item.priceLabel,
        item.icon,
        item.sortOrder
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

  await run(`
    CREATE TABLE IF NOT EXISTS service_menu_items (
      slug TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_label TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_chat_messages_seat ON chat_messages(seat, timestamp)');
  await run('CREATE INDEX IF NOT EXISTS idx_service_requests_seat ON service_requests(seat, timestamp)');
  await run('CREATE INDEX IF NOT EXISTS idx_service_menu_items_category ON service_menu_items(category, sort_order)');

  await seedUsers();
  await seedChatMessages();
  await seedRequests();
  await syncServiceMenuItems();
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

async function listMenuItems(filters = {}) {
  const params = [];
  let sql = `
    SELECT slug, category, name, description, price_label, icon, sort_order
    FROM service_menu_items
  `;

  if (filters.category) {
    sql += ' WHERE category = ?';
    params.push(String(filters.category).trim().toLowerCase());
  }

  sql += ' ORDER BY sort_order ASC, name ASC';

  const rows = await all(sql, params);
  return rows.map(mapMenuRow);
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
  listMenuItems,
  getRequestById,
  upsertRequest,
  updateRequest
};
