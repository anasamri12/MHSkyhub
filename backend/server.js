const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const {
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
} = require('./db');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const ROOT_DIR = path.join(__dirname, '..');
const JWT_SECRET = process.env.JWT_SECRET || 'mhskyhub-demo-secret';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const defaultOrigins = [
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`
];
const allowedOriginSet = new Set([...defaultOrigins, ...allowedOrigins]);

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOriginSet.has(origin)) return callback(null, true);
      callback(new Error(`Socket.IO CORS blocked: ${origin}`));
    },
    methods: ['GET', 'POST', 'PATCH']
  }
});

function allowOrigin(origin) {
  return !origin || allowedOriginSet.has(origin);
}

function normalizeSeat(seat) {
  return String(seat || DEFAULT_CHAT_SEAT).trim().toUpperCase();
}

function buildToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      seat: user.seat || null
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function extractBearerToken(headerValue) {
  const match = String(headerValue || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function verifyToken(token) {
  try {
    return jwt.verify(String(token || '').trim(), JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function getRequestUser(req) {
  if (Object.prototype.hasOwnProperty.call(req, 'authUser')) return req.authUser;
  const token = extractBearerToken(req.get('authorization'));
  req.authUser = token ? verifyToken(token) : null;
  return req.authUser;
}

function requireAuthenticatedUser(req, res, next) {
  const user = getRequestUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  return next();
}

function requireCrewUser(req, res, next) {
  const user = getRequestUser(req);
  if (!user) return res.status(401).json({ error: 'Crew authentication required' });
  if (user.role !== 'crew') return res.status(403).json({ error: 'Crew access required' });
  req.user = user;
  return next();
}


function isPassengerSelfCancelPatch(existingRequest, patch) {
  if (!existingRequest || !patch) return false;

  const keys = Object.keys(patch);
  const claimedSeat = Object.prototype.hasOwnProperty.call(patch, 'seat') ? normalizeSeat(patch.seat) : '';
  const status = String(patch.status || '').trim().toLowerCase();
  const etaValue = Object.prototype.hasOwnProperty.call(patch, 'eta') ? Number(patch.eta) : 0;

  return Boolean(claimedSeat)
    && claimedSeat === normalizeSeat(existingRequest.seat)
    && status === 'cancelled'
    && keys.every(key => ['seat', 'status', 'eta'].includes(key))
    && (!Object.prototype.hasOwnProperty.call(patch, 'eta') || etaValue === 0);
}

function emitChatMessage(message) {
  io.to('crew').emit('chat:message', message);
  io.to(`seat:${message.seat}`).emit('chat:message', message);
  io.emit('chat:thread-updated', { seat: message.seat });
}

function emitRequestCreated(request) {
  io.to('crew').emit('request:created', request);
  io.to(`seat:${request.seat}`).emit('request:created', request);
}

function emitRequestUpdated(request) {
  io.to('crew').emit('request:updated', request);
  io.to(`seat:${request.seat}`).emit('request:updated', request);
}

app.use(cors({
  origin(origin, callback) {
    if (allowOrigin(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  }
}));

app.use(express.json());
app.use(express.static(ROOT_DIR));

app.get('/', (req, res) => {
  res.redirect('/passenger');
});

app.get('/passenger', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'passenger', 'index.html'));
});

app.get('/crew', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'crew', 'index.html'));
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: '"username" and "password" are required' });
  }

  const user = await findUserByUsername(String(username).trim());
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = buildToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      seat: user.seat || null
    }
  });
});

app.get('/api/auth/me', requireAuthenticatedUser, (req, res) => {
  res.json({
    user: {
      id: req.user.sub,
      username: req.user.username,
      role: req.user.role,
      seat: req.user.seat || null
    }
  });
});

app.get('/api/chat', async (req, res) => {
  const seat = normalizeSeat(req.query.seat);
  const messages = await listChatMessages(seat);
  res.json({ seat, messages });
});

app.get('/api/menu', async (req, res) => {
  const filters = {};
  if (req.query.category) filters.category = String(req.query.category).trim().toLowerCase();

  const items = await listMenuItems(filters);
  res.json({ items });
});

app.get('/api/crew/chat', requireCrewUser, async (req, res) => {
  const seat = normalizeSeat(req.query.seat);
  const messages = await listChatMessages(seat);
  res.json({ seat, messages });
});

app.get('/api/chat/threads', requireCrewUser, async (req, res) => {
  const threads = await listChatThreads();
  res.json({ threads });
});

app.post('/api/chat', async (req, res) => {
  const { seat, text, from } = req.body || {};

  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: '"text" is required' });
  }

  if (!['passenger', 'crew'].includes(from)) {
    return res.status(400).json({ error: '"from" must be "passenger" or "crew"' });
  }

  if (from === 'crew') {
    const user = getRequestUser(req);
    if (!user) return res.status(401).json({ error: 'Crew authentication required' });
    if (user.role !== 'crew') return res.status(403).json({ error: 'Crew access required' });
  }

  const message = await createChatMessage({
    seat: normalizeSeat(seat),
    text,
    from
  });

  emitChatMessage(message);
  res.status(201).json({ success: true, message });
});

app.get('/api/requests', async (req, res) => {
  const filters = {};
  if (req.query.seat) filters.seat = normalizeSeat(req.query.seat);

  if (!filters.seat) {
    const user = getRequestUser(req);
    if (!user) return res.status(401).json({ error: 'Crew authentication required' });
    if (user.role !== 'crew') return res.status(403).json({ error: 'Crew access required' });
  }

  const requests = await listRequests(filters);
  res.json({ requests });
});

app.get('/api/requests/:id', requireCrewUser, async (req, res) => {
  const request = await getRequestById(Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Request not found' });
  res.json({ request });
});

app.put('/api/requests/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Request id must be numeric' });
  }

  const payload = {
    ...req.body,
    id
  };

  if (!payload.seat || !payload.type || !payload.item) {
    return res.status(400).json({ error: '"seat", "type", and "item" are required' });
  }

  const existing = await getRequestById(id);
  const request = await upsertRequest(payload);

  if (existing) emitRequestUpdated(request);
  else emitRequestCreated(request);

  res.status(existing ? 200 : 201).json({ success: true, request });
});


app.patch('/api/requests/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Request id must be numeric' });
  }

  const patch = {};
  ['seat', 'type', 'item', 'qty', 'note', 'status', 'eta', 'icon', 'priority'].forEach(key => {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
  });

  const existing = await getRequestById(id);
  if (!existing) return res.status(404).json({ error: 'Request not found' });

  const user = getRequestUser(req);
  const isCrew = Boolean(user && user.role === 'crew');
  const allowPassengerCancel = !isCrew && isPassengerSelfCancelPatch(existing, patch);

  if (!isCrew && !allowPassengerCancel) {
    if (!user) return res.status(401).json({ error: 'Crew authentication required' });
    return res.status(403).json({ error: 'Crew access required' });
  }

  if (allowPassengerCancel) {
    patch.seat = existing.seat;
    patch.status = 'cancelled';
    patch.eta = 0;
  }

  const request = await updateRequest(id, patch);
  emitRequestUpdated(request);
  res.json({ success: true, request });
});

app.get('/api/hello', (req, res) => {
  res.json({
    message: 'MHSkyhub API is live',
    timestamp: new Date().toISOString()
  });
});

io.use((socket, next) => {
  const auth = socket.handshake.auth || {};
  const query = socket.handshake.query || {};
  const claimedRole = String(auth.role || query.role || '').trim().toLowerCase();
  const token = String(auth.token || query.token || '').trim();

  if (token) {
    const user = verifyToken(token);
    if (!user) return next(new Error('Invalid authentication token'));
    socket.data.user = user;
    if (claimedRole === 'crew' && user.role !== 'crew') {
      return next(new Error('Crew access required'));
    }
    return next();
  }

  if (claimedRole === 'crew') {
    return next(new Error('Crew authentication required'));
  }

  return next();
});

io.on('connection', socket => {
  const auth = socket.handshake.auth || {};
  const query = socket.handshake.query || {};
  const user = socket.data.user || null;
  const role = String((user && user.role) || auth.role || query.role || '').trim().toLowerCase();
  const seat = (user && user.seat) || auth.seat || query.seat;

  if (role === 'crew') socket.join('crew');
  if (seat) socket.join(`seat:${normalizeSeat(seat)}`);

  socket.on('seat:join', seatCode => {
    socket.join(`seat:${normalizeSeat(seatCode)}`);
  });

  socket.on('crew:join', () => {
    if (socket.data.user && socket.data.user.role === 'crew') {
      socket.join('crew');
    }
  });
});

async function start() {
  await initDb();

  server.listen(PORT, () => {
    console.log(`MHSkyhub API  ->  http://localhost:${PORT}/api/hello`);
    console.log(`Passenger     ->  http://localhost:${PORT}/passenger`);
    console.log(`Crew          ->  http://localhost:${PORT}/crew`);
    console.log(`Socket.IO     ->  ws://localhost:${PORT}`);
    console.log(`Demo crew     ->  ${process.env.DEMO_CREW_USERNAME || 'crew'} / ${process.env.DEMO_CREW_PASSWORD || 'mhcrew123'}`);
  });
}

start().catch(err => {
  console.error('Failed to start MHSkyhub backend:', err);
  process.exit(1);
});
