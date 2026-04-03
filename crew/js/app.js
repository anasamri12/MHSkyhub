// ============================================================
// API
// ============================================================
const API_BASE = '/api';
const DEFAULT_CHAT_SEAT = '14A';
const CHAT_POLL_MS = 2500;

// Example: load TV posters from backend and render into a container
// Useful if you add a crew entertainment/briefing screen later
async function loadTvPosters(containerEl) {
  try {
    const res     = await fetch(`${API_BASE}/posters/tv`);
    const posters = await res.json();
    containerEl.innerHTML = posters.map(p =>
      `<div class="poster-card">
         <img src="${p.url}" alt="${p.title}" loading="lazy">
         <p>${p.title}</p>
       </div>`
    ).join('');
  } catch (err) {
    console.error('Could not load TV posters:', err);
  }
}

// Example: log a crew action (status change) to the backend
// Drop this call inside setDetailStatus() after syncStatusToPassenger(req)
async function logCrewAction(text) {
  try {
    await fetch(`${API_BASE}/message`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text, from: 'crew' })
    });
  } catch (err) {
    console.error('Could not reach API (offline mode still works):', err);
  }
}

// ============================================================
// DATA
// ============================================================
const DEFAULT_REQUESTS = [
  { id: 9001, seat: '22C', type: 'assist', item: 'Blanket', qty: 1, note: 'Extra soft if available', status: 'inprogress', timestamp: Date.now() - 3*60000, eta: 120, icon: '\uD83D\uDECF', priority: 'normal' },
  { id: 9002, seat: '08B', type: 'order', item: 'Water', qty: 2, note: '', status: 'new', timestamp: Date.now() - 1*60000, eta: 180, icon: '\uD83D\uDCA7', priority: 'normal' },
  { id: 9003, seat: '31F', type: 'assist', item: 'Cleaning', qty: 1, note: 'Spill at seat', status: 'inprogress', timestamp: Date.now() - 5*60000, eta: 60, icon: '\uD83E\uDDF9', priority: 'urgent' },
  { id: 9004, seat: '05A', type: 'assist', item: 'Headset', qty: 1, note: '', status: 'completed', timestamp: Date.now() - 8*60000, eta: 0, icon: '\uD83C\uDFA7', priority: 'done' },
];

let requests = [];
let selectedRequestId = null;
let currentFilter = 'all';
let syncInterval = null;
let toastTimeout = null;
let prevPassengerReqIds = new Set();
let crewChatSeat = DEFAULT_CHAT_SEAT;
let crewChatMessages = [];
let crewChatInitialized = false;
let crewAppInitialized = false;
let crewClockInterval = null;
let crewFiltersBound = false;

function crewApiFetch(url, options) {
  if (window.crewAuth && typeof window.crewAuth.fetch === 'function') {
    return window.crewAuth.fetch(url, options);
  }
  return fetch(url, options);
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
  if (type === 'assist') return '\uD83D\uDECE';
  return '\u2615';
}

function getRequestIcon(request) {
  if (hasUsableIcon(request && request.icon)) return String(request.icon).trim();
  return inferRequestIcon(request);
}

function normalizeChatSeat(seat) {
  return normalizeSeatCode(seat || DEFAULT_CHAT_SEAT) || DEFAULT_CHAT_SEAT;
}

function formatChatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function normalizeCrewChatMessages(messages) {
  return (messages || [])
    .map((message, index) => ({
      id: message.id ?? index + 1,
      seat: normalizeChatSeat(message.seat),
      from: message.from === 'crew' ? 'crew' : 'passenger',
      text: String(message.text || ''),
      timestamp: message.timestamp || new Date().toISOString()
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function scrollCrewChatToBottom() {
  setTimeout(() => {
    const panel = document.getElementById('crew-chat-messages');
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, 50);
}

function renderCrewChatSeatOptions(threads) {
  const select = document.getElementById('crew-chat-seat');
  const meta = document.getElementById('crew-chat-meta');
  if (!select) return;

  const seats = Array.from(new Set([
    DEFAULT_CHAT_SEAT,
    ...requests.map(req => normalizeChatSeat(req.seat)),
    ...(threads || []).map(thread => normalizeChatSeat(thread.seat))
  ])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!seats.includes(crewChatSeat)) crewChatSeat = seats[0] || DEFAULT_CHAT_SEAT;

  select.innerHTML = seats.map(seat => `<option value="${seat}">Seat ${seat}</option>`).join('');
  select.value = crewChatSeat;

  const activeThread = (threads || []).find(thread => normalizeChatSeat(thread.seat) === crewChatSeat);
  if (meta) {
    meta.textContent = activeThread
      ? `${activeThread.messageCount} messages - last ${formatChatTime(activeThread.updatedAt)}`
      : `Seat ${crewChatSeat} - waiting for messages`;
  }
}

function renderCrewChatMessages(messages) {
  const panel = document.getElementById('crew-chat-messages');
  if (!panel) return;

  if (!messages.length) {
    panel.innerHTML = `<div class="crew-chat-empty">No messages yet for Seat ${crewChatSeat}. When the passenger sends a message, it will appear here.</div>`;
    return;
  }

  panel.innerHTML = messages.map(message =>
    '<div class="crew-chat-row ' + message.from + '">' +
      '<div class="crew-chat-bubble">' + escapeHtml(message.text) + '</div>' +
      '<div class="crew-chat-time">' + formatChatTime(message.timestamp) + '</div>' +
    '</div>'
  ).join('');
}

async function fetchCrewChatThreads(silent) {
  try {
    const res = await crewApiFetch(`${API_BASE}/chat/threads`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Thread fetch failed: ' + res.status);
    const payload = await res.json();
    renderCrewChatSeatOptions(payload.threads || []);
    return payload.threads || [];
  } catch (err) {
    if (!silent) console.error('Could not load crew chat threads:', err);
    renderCrewChatSeatOptions([]);
    return [];
  }
}

async function fetchCrewChatMessages(silent) {
  const quiet = silent === true;
  const seat = normalizeChatSeat(crewChatSeat);
  const previousLastId = crewChatMessages.length ? crewChatMessages[crewChatMessages.length - 1].id : 0;

  try {
    const res = await crewApiFetch(`${API_BASE}/crew/chat?seat=${encodeURIComponent(seat)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Chat fetch failed: ' + res.status);

    const payload = await res.json();
    crewChatSeat = normalizeChatSeat(payload.seat || seat);
    crewChatMessages = normalizeCrewChatMessages(payload.messages);
    renderCrewChatMessages(crewChatMessages);

    if (crewChatInitialized) {
      const newPassengerMessages = crewChatMessages.filter(message => message.id > previousLastId && message.from === 'passenger');
      if (newPassengerMessages.length) {
        showToast(`New chat from Seat ${crewChatSeat}`, 'alert');
      }
    } else {
      crewChatInitialized = true;
    }

    if (!quiet) scrollCrewChatToBottom();
    return true;
  } catch (err) {
    if (!quiet) console.error('Could not load crew chat:', err);
    renderCrewChatMessages([]);
    return false;
  }
}

function changeCrewChatSeat(seat) {
  crewChatSeat = normalizeChatSeat(seat);
  crewChatMessages = [];
  crewChatInitialized = false;
  fetchCrewChatMessages(false);
  fetchCrewChatThreads(true);
}

async function sendCrewChat() {
  const input = document.getElementById('crew-chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.disabled = true;

  try {
    const res = await crewApiFetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seat: normalizeChatSeat(crewChatSeat), from: 'crew', text })
    });
    if (!res.ok) throw new Error('Chat send failed: ' + res.status);

    const payload = await res.json();
    crewChatMessages = normalizeCrewChatMessages([...crewChatMessages, payload.message]);
    renderCrewChatMessages(crewChatMessages);
    input.value = '';
    scrollCrewChatToBottom();
    await fetchCrewChatThreads(true);
  } catch (err) {
    showToast('Crew chat is unavailable right now', 'info');
    console.error('Could not send crew chat:', err);
  } finally {
    input.disabled = false;
    input.focus();
  }
}

// ============================================================
// INIT
// ============================================================
async function init() {
  if (crewAppInitialized) return;
  if (window.crewAuth && typeof window.crewAuth.canBoot === 'function' && !window.crewAuth.canBoot()) return;

  crewAppInitialized = true;
  loadRequests();
  renderSidebar();
  renderCabinMap();
  updateBadges();
  updateClock();
  if (!crewClockInterval) crewClockInterval = setInterval(updateClock, 1000);
  await fetchCrewChatThreads(false);
  await fetchCrewChatMessages(false);
  syncInterval = setInterval(() => {
    syncFromPassenger();
    fetchCrewChatThreads(true);
    fetchCrewChatMessages(true);
  }, CHAT_POLL_MS);

  if (!crewFiltersBound) {
    document.querySelectorAll('.section-filter-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.section-filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
      });
    });
    crewFiltersBound = true;
  }
}

function stopCrewApp() {
  crewAppInitialized = false;
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (crewClockInterval) {
    clearInterval(crewClockInterval);
    crewClockInterval = null;
  }
}

function loadRequests() {
  // Load defaults + any from localStorage
  const stored = JSON.parse(localStorage.getItem('mhskyhub_requests') || '[]');
  // Merge: defaults first, then passenger requests
  const defaultIds = new Set(DEFAULT_REQUESTS.map(r => r.id));
  const passengerReqs = stored.filter(r => !defaultIds.has(r.id));
  requests = [...DEFAULT_REQUESTS, ...passengerReqs];

  // Track passenger req IDs to detect new ones
  passengerReqs.forEach(r => prevPassengerReqIds.add(r.id));
}

function syncFromPassenger() {
  const stored = JSON.parse(localStorage.getItem('mhskyhub_requests') || '[]');
  const defaultIds = new Set(DEFAULT_REQUESTS.map(r => r.id));
  const passengerReqs = stored.filter(r => !defaultIds.has(r.id));

  passengerReqs.forEach(r => {
    const existing = requests.find(req => req.id === r.id);
    if (!existing) {
      // New request from passenger
      r.priority = r.type === 'assist' && r.item === 'Medical' ? 'urgent' : 'normal';
      requests.unshift(r);
      if (!prevPassengerReqIds.has(r.id)) {
        prevPassengerReqIds.add(r.id);
        showToast('New request from Seat ' + r.seat + ' - ' + r.item, 'alert');
        updateBadges();
        renderSidebar();
        renderCabinMap();
      }
    } else if (existing.status !== r.status && existing.id === r.id) {
      // Don't override crew status with passenger version (crew is authoritative)
    }
  });
}

// ============================================================
// CLOCK
// ============================================================
function updateClock() {
  const now = new Date();
  document.getElementById('crew-clock').textContent =
    String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
}

// ============================================================
// FILTER
// ============================================================
function setFilter(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderSidebar();
}

function filterRequests() {
  renderSidebar();
}

function getFilteredRequests() {
  const query = (document.getElementById('search-input').value || '').toLowerCase();
  return requests.filter(r => {
    const matchFilter =
      currentFilter === 'all' ||
      (currentFilter === 'new' && r.status === 'new') ||
      (currentFilter === 'inprogress' && r.status === 'inprogress') ||
      (currentFilter === 'completed' && (r.status === 'completed' || r.status === 'delivered'));
    const matchQuery = !query ||
      r.seat.toLowerCase().includes(query) ||
      r.item.toLowerCase().includes(query);
    return matchFilter && matchQuery && r.status !== 'cancelled';
  });
}

// ============================================================
// SIDEBAR RENDER
// ============================================================
function renderSidebar() {
  const list = document.getElementById('sidebar-list');
  const filtered = getFilteredRequests();

  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:30px 16px;color:var(--text-muted);font-size:13px;">No requests found</div>';
    return;
  }

  list.innerHTML = filtered.map(r => {
    const ago = getTimeAgo(r.timestamp);
    const statusLabel = getStatusLabel(r.status);
    const statusClass = getStatusClass(r.status);
    const priorityClass = getPriorityClass(r);
    const isSelected = r.id === selectedRequestId;
    const isNew = r.status === 'new' && (Date.now() - r.timestamp) < 120000;

    return `<div class="request-card ${priorityClass} ${isSelected ? 'selected' : ''}"
      onclick="selectRequest(${r.id})">
      ${isNew ? '<div class="new-pulse">NEW</div>' : ''}
      <div class="rc-top">
        <div class="rc-seat">${r.seat}</div>
        <div class="rc-status ${statusClass}">${statusLabel}</div>
      </div>
      <div class="rc-mid">
        <div class="rc-icon">${getRequestIcon(r)}</div>
        <div class="rc-item">${r.item}${r.qty > 1 ? ' \u00D7' + r.qty : ''}</div>
      </div>
      <div class="rc-bot">
        <div class="rc-time">${ago}</div>
      </div>
    </div>`;
  }).join('');

  updateFilterCounts();
}

function getStatusLabel(s) {
  const m = { new:'\u25CF New', inprogress:'\u25CF In Progress', completed:'\u2713 Done', delivered:'\u2713 Delivered', cancelled:'Cancelled', preparing:'Preparing', ontheway:'On the Way' };
  return m[s] || s;
}
function getStatusClass(s) {
  if (s === 'new') return 'status-new';
  if (s === 'inprogress' || s === 'preparing' || s === 'ontheway') return 'status-inprogress';
  if (s === 'completed' || s === 'delivered') return 'status-completed';
  return '';
}
function getPriorityClass(r) {
  if (r.status === 'completed' || r.status === 'delivered') return 'priority-done';
  if (r.priority === 'urgent') return 'priority-urgent';
  return 'priority-normal';
}
function getTimeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 120) return '1 min ago';
  return Math.floor(diff/60) + ' min ago';
}

function updateFilterCounts() {
  const all = requests.filter(r => r.status !== 'cancelled');
  document.getElementById('fc-all').textContent = all.length;
  document.getElementById('fc-new').textContent = requests.filter(r => r.status === 'new').length;
  document.getElementById('fc-inprogress').textContent = requests.filter(r => r.status === 'inprogress' || r.status === 'preparing' || r.status === 'ontheway').length;
  document.getElementById('fc-completed').textContent = requests.filter(r => r.status === 'completed' || r.status === 'delivered').length;
}

function updateBadges() {
  const active = requests.filter(r => r.status === 'new').length;
  const inprog = requests.filter(r => r.status === 'inprogress' || r.status === 'preparing' || r.status === 'ontheway').length;
  const done = requests.filter(r => r.status === 'completed' || r.status === 'delivered').length;
  document.getElementById('badge-active').textContent = active;
  document.getElementById('badge-inprogress').textContent = inprog;
  document.getElementById('badge-completed').textContent = done;
  document.getElementById('ac-active').textContent = active;
  document.getElementById('ac-completed').textContent = done;
}

// ============================================================
// CABIN MAP
// ============================================================
function normalizeSeatCode(seat) {
  const match = String(seat || '').trim().toUpperCase().match(/^0*(\d+)([A-Z])$/);
  if (!match) return String(seat || '').trim().toUpperCase();
  return String(parseInt(match[1], 10)) + match[2];
}

function getCabinClass(seat) {
  const match = String(seat || '').match(/^0*(\d+)/);
  const row = match ? parseInt(match[1], 10) : 99;
  return row <= 6 ? 'Business Class' : 'Economy Class';
}

function buildSeatCluster(row, letters, seatStatus, type, extraClass) {
  return `<div class="seat-cluster ${extraClass || ''}">` + letters.map(letter => {
    const seatCode = `${row}${letter}`;
    const status = seatStatus[seatCode];
    const stateClass = status ? getSeatClass(status) + ' has-request' : '';
    const seatClass = type === 'business' ? 'business' : '';
    const bubbleClass = ['seat-bubble', seatClass, stateClass].filter(Boolean).join(' ');
    return `<div class="${bubbleClass}" title="${seatCode}${status ? ' - ' + getStatusLabel(status) : ''}">${status ? letter : ''}</div>`;
  }).join('') + `</div>`;
}

function buildSeatRow(row, section, seatStatus) {
  const rowClass = section.type === 'business' ? 'business' : 'economy';
  const aisleClass = section.type === 'business' ? 'business' : '';
  return `<div class="seat-row ${rowClass}">
    <div class="seat-row-label">${row}</div>
    ${buildSeatCluster(row, section.clusters[0], seatStatus, section.type, '')}
    <div class="aisle-gap ${aisleClass}"></div>
    ${buildSeatCluster(row, section.clusters[1], seatStatus, section.type, section.type === 'business' ? 'business-center' : '')}
    <div class="aisle-gap ${aisleClass}"></div>
    ${buildSeatCluster(row, section.clusters[2], seatStatus, section.type, '')}
  </div>`;
}

function renderCabinMap() {
  const map = document.getElementById('cabin-map');
  if (!map) return;

  const seatStatus = {};
  requests.forEach(r => {
    if (r.status !== 'cancelled') seatStatus[normalizeSeatCode(r.seat)] = r.status;
  });

  const layout = [
    {
      title: 'Business Suite',
      rowsLabel: 'Rows 1-6',
      type: 'business',
      rows: [1, 2, 3, 4, 5, 6],
      clusters: [['A'], ['D', 'G'], ['K']]
    },
    { breakLabel: 'Door 2 - Galley' },
    {
      title: 'Economy Forward',
      rowsLabel: 'Rows 7-20',
      type: 'economy',
      rows: Array.from({ length: 14 }, (_, i) => i + 7),
      clusters: [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'K']]
    },
    { breakLabel: 'Door 4 - Cross Aisle' },
    {
      title: 'Economy Rear',
      rowsLabel: 'Rows 21-32',
      type: 'economy',
      rows: Array.from({ length: 12 }, (_, i) => i + 21),
      clusters: [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'K']]
    }
  ];

  map.innerHTML = layout.map(section => {
    if (section.breakLabel) {
      return `<div class="cabin-break">${section.breakLabel}</div>`;
    }

    return `<div class="cabin-section">
      <div class="cabin-section-header">
        <span class="cabin-section-tag">${section.title}</span>
        <span>${section.rowsLabel}</span>
      </div>
      <div class="cabin-rows">
        ${section.rows.map(row => buildSeatRow(row, section, seatStatus)).join('')}
      </div>
    </div>`;
  }).join('');
}

function getSeatClass(status) {
  if (status === 'new') return 'new-req';
  if (status === 'inprogress' || status === 'preparing' || status === 'ontheway') return 'inprogress';
  if (status === 'completed' || status === 'delivered') return 'done-req';
  return '';
}

// ============================================================
// REQUEST DETAIL
// ============================================================
function selectRequest(id) {
  selectedRequestId = id;
  const req = requests.find(r => r.id === id);
  if (!req) return;

  renderSidebar();
  document.getElementById('panel-default').style.display = 'none';
  document.getElementById('panel-detail').classList.add('active');

  document.getElementById('detail-seat').textContent = req.seat;
  document.getElementById('detail-class').textContent = getCabinClass(req.seat);
  document.getElementById('detail-icon').textContent = getRequestIcon(req);
  document.getElementById('detail-item-name').textContent = req.item + (req.qty > 1 ? ' \u00D7' + req.qty : '');

  const ago = getTimeAgo(req.timestamp);
  const timeStr = new Date(req.timestamp).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
  document.getElementById('detail-meta').textContent = 'Submitted ' + timeStr + ' - ' + ago;

  if (req.note) {
    document.getElementById('detail-note-block').style.display = 'block';
    document.getElementById('detail-note-text').textContent = req.note;
  } else {
    document.getElementById('detail-note-block').style.display = 'none';
  }

  updateDetailStatus(req.status);
  document.getElementById('right-panel').scrollTop = 0;
}

function closeDetail() {
  selectedRequestId = null;
  document.getElementById('panel-default').style.display = 'block';
  document.getElementById('panel-detail').classList.remove('active');
  renderSidebar();
}

function updateDetailStatus(status) {
  // Update status badge
  const badge = document.getElementById('detail-status-badge');
  badge.className = 'dh-status-badge ' + getStatusClass(status);
  badge.textContent = getStatusLabel(status);

  // Update workflow steps
  const stepOrder = ['new', 'preparing', 'ontheway', 'delivered'];
  const wsIds = ['ws-new', 'ws-preparing', 'ws-ontheway', 'ws-delivered'];
  const normalStatuses = { new:'new', inprogress:'preparing' }; // map inprogress to preparing for display
  const displayStatus = normalStatuses[status] || status;
  const currentIdx = stepOrder.indexOf(displayStatus);

  wsIds.forEach((wsId, idx) => {
    const el = document.getElementById(wsId);
    if (!el) return;
    el.classList.remove('active','completed');
    if (idx < currentIdx) el.classList.add('completed');
    else if (idx === currentIdx) el.classList.add('active');
  });

  // Show/hide delivered success
  const ds = document.getElementById('delivered-success');
  const mkBtn = document.getElementById('mark-complete-btn');
  if (status === 'delivered' || status === 'completed') {
    ds.classList.add('show');
    mkBtn.style.display = 'none';
  } else if (displayStatus === 'ontheway') {
    ds.classList.remove('show');
    mkBtn.style.display = 'inline-flex';
  } else {
    ds.classList.remove('show');
    mkBtn.style.display = 'none';
  }
}

function setDetailStatus(status) {
  if (selectedRequestId === null) return;
  const req = requests.find(r => r.id === selectedRequestId);
  if (!req) return;

  req.status = status;
  updateDetailStatus(status);
  syncStatusToPassenger(req);
  updateBadges();
  renderSidebar();
  renderCabinMap();

  const labels = { preparing:'Marked as Preparing', ontheway:'Marked as On the Way', delivered:'Marked as Delivered', new:'Reset to Received' };
  showToast(labels[status] || status, 'success');
}

function markComplete() {
  setDetailStatus('delivered');
}

function markUnable() {
  if (selectedRequestId === null) return;
  const req = requests.find(r => r.id === selectedRequestId);
  if (!req) return;
  req.status = 'cancelled';
  syncStatusToPassenger(req);
  updateBadges();
  renderSidebar();
  renderCabinMap();
  showToast('Request marked as unable to fulfil', 'info');
  closeDetail();
}

// ============================================================
// SYNC TO PASSENGER
// ============================================================
function syncStatusToPassenger(req) {
  const stored = JSON.parse(localStorage.getItem('mhskyhub_requests') || '[]');
  const idx = stored.findIndex(r => r.id === req.id);
  if (idx >= 0) {
    stored[idx].status = req.status;
    stored[idx].eta = req.eta || 0;
    localStorage.setItem('mhskyhub_requests', JSON.stringify(stored));
  }
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + (type || '');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { t.className = ''; }, 4000);
}

// ============================================================
// SECTION FILTER
// ============================================================
// (already handled inline in HTML above)

window.startCrewApp = init;
window.stopCrewApp = stopCrewApp;
document.addEventListener('DOMContentLoaded', init);
