// ============================================================
// DATA
// ============================================================
const DEFAULT_REQUESTS = [
  { id: 9001, seat: '22C', type: 'assist', item: 'Blanket', qty: 1, note: 'Extra soft if available', status: 'inprogress', timestamp: Date.now() - 3*60000, eta: 120, icon: '🛏', priority: 'normal' },
  { id: 9002, seat: '08A', type: 'order', item: 'Teh Tarik', qty: 1, note: '', status: 'new', timestamp: Date.now() - 1*60000, eta: 180, icon: '💧', priority: 'normal' },
  { id: 9003, seat: '31F', type: 'assist', item: 'Cleaning', qty: 1, note: 'Spill at seat', status: 'inprogress', timestamp: Date.now() - 5*60000, eta: 60, icon: '🧹', priority: 'urgent' },
  { id: 9004, seat: '05A', type: 'assist', item: 'Headset', qty: 1, note: '', status: 'completed', timestamp: Date.now() - 8*60000, eta: 0, icon: '🎧', priority: 'done' },
];

let requests = [];
let selectedRequestId = null;
let currentFilter = 'all';
let syncInterval = null;
let toastTimeout = null;
let prevPassengerReqIds = new Set();

// ============================================================
// INIT
// ============================================================
function init() {
  loadRequests();
  renderSidebar();
  renderCabinMap();
  updateBadges();
  updateClock();
  loadCrewChat();
  setInterval(updateClock, 1000);
  syncInterval = setInterval(syncFromPassenger, 2000);

  document.getElementById('crew-chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendCrewChat();
  });

  // Section filter buttons
  document.querySelectorAll('.section-filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.section-filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });
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
        showToast('🔔 New request from Seat ' + r.seat + ' — ' + r.item, 'alert');
        updateBadges();
        renderSidebar();
        renderCabinMap();
      }
    } else if (existing.status !== r.status && existing.id === r.id) {
      // Don't override crew status with passenger version (crew is authoritative)
    }
  });

  syncCrewChat();
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
        <div class="rc-icon">${r.icon || '📦'}</div>
        <div class="rc-item">${r.item}${r.qty > 1 ? ' ×' + r.qty : ''}</div>
      </div>
      <div class="rc-bot">
        <div class="rc-time">${ago}</div>
      </div>
    </div>`;
  }).join('');

  updateFilterCounts();
}

function getStatusLabel(s) {
  const m = { new:'● New', inprogress:'● In Progress', completed:'✓ Done', delivered:'✓ Delivered', cancelled:'Cancelled', preparing:'Preparing', ontheway:'On the Way' };
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
    return `<div class="${bubbleClass}" title="${seatCode}${status ? ' · ' + getStatusLabel(status) : ''}">${status ? letter : ''}</div>`;
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
    { breakLabel: 'Door 2 · Galley' },
    {
      title: 'Economy Forward',
      rowsLabel: 'Rows 7-20',
      type: 'economy',
      rows: Array.from({ length: 14 }, (_, i) => i + 7),
      clusters: [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'K']]
    },
    { breakLabel: 'Door 4 · Cross Aisle' },
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

  // Highlight in sidebar
  renderSidebar();

  // Show detail panel, hide default
  document.getElementById('panel-default').style.display = 'none';
  document.getElementById('panel-detail').classList.add('active');

  // Populate detail
  document.getElementById('detail-seat').textContent = req.seat;
  document.getElementById('detail-class').textContent = getCabinClass(req.seat);
  document.getElementById('detail-icon').textContent = req.icon || '📦';
  document.getElementById('detail-item-name').textContent = req.item + (req.qty > 1 ? ' ×' + req.qty : '');

  const ago = getTimeAgo(req.timestamp);
  const timeStr = new Date(req.timestamp).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
  document.getElementById('detail-meta').textContent = 'Submitted ' + timeStr + ' · ' + ago;

  if (req.note) {
    document.getElementById('detail-note-block').style.display = 'block';
    document.getElementById('detail-note-text').textContent = req.note;
  } else {
    document.getElementById('detail-note-block').style.display = 'none';
  }

  updateDetailStatus(req.status);

  // Scroll to top
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
  showToast('✓ ' + (labels[status] || status), 'success');
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
// CREW CHAT
// ============================================================
let crewChatSeat = null;   // which seat the crew is currently viewing
let crewChatCount = 0;     // total message count across all seats (for change detection)

function loadCrewChat() {
  const all = JSON.parse(localStorage.getItem('mhskyhub_chat') || '[]');
  crewChatCount = all.length;
  refreshCrewChatUI(all);
}

// Build seat tabs + message list from the full chat log
function refreshCrewChatUI(all) {
  const seats = [...new Set(all.map(m => m.seat).filter(Boolean))];

  // Render seat tabs
  const tabsEl = document.getElementById('crew-chat-seats');
  if (tabsEl) {
    if (seats.length === 0) {
      tabsEl.style.display = 'none';
    } else {
      tabsEl.style.display = 'flex';
      // Auto-select first seat if none chosen or previous seat no longer exists
      if (!crewChatSeat || !seats.includes(crewChatSeat)) crewChatSeat = seats[0];
      // Count unread (passenger messages) per seat for dot indicator
      const unreadBySeat = {};
      all.filter(m => m.from === 'passenger' && m.seat).forEach(m => {
        unreadBySeat[m.seat] = (unreadBySeat[m.seat] || 0) + 1;
      });
      tabsEl.innerHTML = seats.map(seat =>
        `<div class="crew-seat-tab ${crewChatSeat === seat ? 'active' : ''}" onclick="selectCrewChatSeat('${seat}')">${seat}</div>`
      ).join('');
    }
  }

  // Render messages for selected seat
  const msgEl = document.getElementById('crew-chat-messages');
  if (!msgEl) return;

  if (seats.length === 0) {
    msgEl.innerHTML = '<div class="crew-chat-empty">No messages yet.<br>Passengers can reach you via the Chat screen on their IFE.</div>';
    return;
  }

  const filtered = all.filter(m => m.seat === crewChatSeat);
  if (filtered.length === 0) {
    msgEl.innerHTML = '<div class="crew-chat-empty">No messages from seat ' + crewChatSeat + ' yet.</div>';
    return;
  }

  msgEl.innerHTML = filtered.map(msg => {
    const isCrew = msg.from === 'crew';
    const time = new Date(msg.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `<div class="ccmsg ${isCrew ? 'ccmsg-crew' : 'ccmsg-passenger'}">
      <div class="ccmsg-bubble">${escapeCrewHtml(msg.text)}</div>
      <div class="ccmsg-meta">${isCrew ? 'You' : 'Seat ' + msg.seat} · ${time}</div>
    </div>`;
  }).join('');
  scrollCrewChatToBottom();
}

function selectCrewChatSeat(seat) {
  crewChatSeat = seat;
  const all = JSON.parse(localStorage.getItem('mhskyhub_chat') || '[]');
  refreshCrewChatUI(all);
}

function syncCrewChat() {
  const all = JSON.parse(localStorage.getItem('mhskyhub_chat') || '[]');
  if (all.length !== crewChatCount) {
    const prevCount = crewChatCount;
    crewChatCount = all.length;
    // Find newest message
    const newest = all[all.length - 1];
    const isNewPassenger = all.length > prevCount && newest && newest.from === 'passenger';
    refreshCrewChatUI(all);
    if (isNewPassenger) {
      showToast('💬 New message from Seat ' + (newest.seat || '?'), 'info');
      const badge = document.getElementById('crew-chat-unread');
      if (badge) {
        badge.textContent = 'New · ' + (newest.seat || '');
        badge.style.display = 'inline-block';
        setTimeout(() => { badge.style.display = 'none'; }, 4000);
      }
    }
  }
}

function sendCrewChat() {
  if (!crewChatSeat) {
    showToast('No passenger seat selected', 'info');
    return;
  }
  const input = document.getElementById('crew-chat-input');
  const text = input.value.trim();
  if (!text) return;
  const chatLog = JSON.parse(localStorage.getItem('mhskyhub_chat') || '[]');
  chatLog.push({ from: 'crew', seat: crewChatSeat, text, time: Date.now() });
  localStorage.setItem('mhskyhub_chat', JSON.stringify(chatLog));
  crewChatCount = chatLog.length;
  input.value = '';
  refreshCrewChatUI(chatLog);
}

function scrollCrewChatToBottom() {
  setTimeout(() => {
    const c = document.getElementById('crew-chat-messages');
    if (c) c.scrollTop = c.scrollHeight;
  }, 30);
}

function escapeCrewHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

document.addEventListener('DOMContentLoaded', init);
