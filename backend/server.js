const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_CHAT_SEAT = '14A';
const chatMessages = [
  {
    id: 1,
    seat: DEFAULT_CHAT_SEAT,
    from: 'crew',
    text: 'Good afternoon! How can I assist you today?',
    timestamp: new Date(Date.now() - 3 * 60000).toISOString()
  },
  {
    id: 2,
    seat: DEFAULT_CHAT_SEAT,
    from: 'passenger',
    text: 'Could I get an extra pillow please?',
    timestamp: new Date(Date.now() - 2 * 60000).toISOString()
  },
  {
    id: 3,
    seat: DEFAULT_CHAT_SEAT,
    from: 'crew',
    text: "Of course! I'll bring that right over. Anything else?",
    timestamp: new Date(Date.now() - 1 * 60000).toISOString()
  }
];
let nextChatId = 4;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const defaultOrigins = [
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`
];
const allowedOriginSet = new Set([...defaultOrigins, ...allowedOrigins]);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOriginSet.has(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  }
}));

app.use(express.json());
app.use(express.static(ROOT_DIR));

app.get('/', (req, res) => {
  res.redirect('/passenger/index.html');
});

app.get('/passenger', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'passenger', 'index.html'));
});

app.get('/crew', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'crew', 'index.html'));
});

function normalizeSeat(seat) {
  return String(seat || DEFAULT_CHAT_SEAT).trim().toUpperCase();
}

function sortByTimestamp(a, b) {
  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}

app.get('/api/chat', (req, res) => {
  const seat = normalizeSeat(req.query.seat);
  const messages = chatMessages
    .filter(message => normalizeSeat(message.seat) === seat)
    .sort(sortByTimestamp);

  res.json({
    seat,
    messages
  });
});

app.get('/api/chat/threads', (req, res) => {
  const grouped = new Map();

  chatMessages.forEach(message => {
    const seat = normalizeSeat(message.seat);
    if (!grouped.has(seat)) grouped.set(seat, []);
    grouped.get(seat).push(message);
  });

  const threads = Array.from(grouped.entries())
    .map(([seat, messages]) => {
      const sorted = [...messages].sort(sortByTimestamp);
      const lastMessage = sorted[sorted.length - 1];
      return {
        seat,
        messageCount: sorted.length,
        updatedAt: lastMessage.timestamp,
        lastFrom: lastMessage.from,
        lastText: lastMessage.text
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  res.json({ threads });
});

app.post('/api/chat', (req, res) => {
  const { seat, text, from } = req.body;

  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: '"text" is required' });
  }

  if (!['passenger', 'crew'].includes(from)) {
    return res.status(400).json({ error: '"from" must be "passenger" or "crew"' });
  }

  const message = {
    id: nextChatId++,
    seat: normalizeSeat(seat),
    text: String(text).trim(),
    from,
    timestamp: new Date().toISOString()
  };

  chatMessages.push(message);
  res.status(201).json({ success: true, message });
});

app.get('/api/hello', (req, res) => {
  res.json({
    message: 'MHSkyhub API is live',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/posters/movies', (req, res) => {
  const dir = path.join(ROOT_DIR, 'assets', 'posters', 'movies');

  try {
    const files = fs.readdirSync(dir).filter(file => /\.(jpg|jpeg|png|webp|avif)$/i.test(file));
    const posters = files.map(file => ({
      title: file.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, ''),
      file,
      url: `/assets/posters/movies/${file}`
    }));
    res.json(posters);
  } catch {
    res.status(500).json({ error: 'Could not read movies directory' });
  }
});

app.get('/api/posters/tv', (req, res) => {
  const dir = path.join(ROOT_DIR, 'assets', 'posters', 'tv');

  try {
    const files = fs.readdirSync(dir).filter(file => /\.(jpg|jpeg|png|webp|avif)$/i.test(file));
    const posters = files.map(file => ({
      title: file.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, ''),
      file,
      url: `/assets/posters/tv/${file}`
    }));
    res.json(posters);
  } catch {
    res.status(500).json({ error: 'Could not read TV directory' });
  }
});

app.get('/api/widgets', (req, res) => {
  const dir = path.join(ROOT_DIR, 'assets', 'widgets', 'home');

  try {
    const files = fs.readdirSync(dir);
    const widgets = files.map(file => ({
      name: file.replace(/\.[^.]+$/, ''),
      file,
      url: `/assets/widgets/home/${file}`
    }));
    res.json(widgets);
  } catch {
    res.status(500).json({ error: 'Could not read widgets directory' });
  }
});

app.post('/api/message', (req, res) => {
  const { text, from } = req.body;

  if (!text || !from) {
    return res.status(400).json({ error: 'Both "text" and "from" are required' });
  }

  if (!['passenger', 'crew'].includes(from)) {
    return res.status(400).json({ error: '"from" must be "passenger" or "crew"' });
  }

  const message = {
    id: Date.now(),
    text,
    from,
    timestamp: new Date().toISOString(),
    status: 'received'
  };

  console.log(`[MSG] ${from.toUpperCase()} -> ${text}`);
  res.status(201).json({ success: true, message });
});

app.listen(PORT, () => {
  console.log(`MHSkyhub API  ->  http://localhost:${PORT}/api/hello`);
  console.log(`Passenger     ->  http://localhost:${PORT}/passenger`);
  console.log(`Crew          ->  http://localhost:${PORT}/crew`);
});
