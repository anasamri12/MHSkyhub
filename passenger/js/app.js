// ============================================================
// API
// ============================================================
const API_BASE = '/api';
const PASSENGER_SEAT = '14A';
const CHAT_POLL_MS = 2500;
const DEFAULT_CHAT_MESSAGES = [
  {
    id: 1,
    seat: PASSENGER_SEAT,
    from: 'crew',
    text: 'Good afternoon! How can I assist you today?',
    timestamp: new Date(Date.now() - 3 * 60000).toISOString()
  },
  {
    id: 2,
    seat: PASSENGER_SEAT,
    from: 'passenger',
    text: 'Could I get an extra pillow please?',
    timestamp: new Date(Date.now() - 2 * 60000).toISOString()
  },
  {
    id: 3,
    seat: PASSENGER_SEAT,
    from: 'crew',
    text: "Of course! I'll bring that right over. Anything else?",
    timestamp: new Date(Date.now() - 1 * 60000).toISOString()
  }
];

// Example: load movie posters from backend and render into a container
// Call this wherever you build the watch/movies screen, e.g. inside setWatchTab('movies')
async function loadMoviePosters(containerEl) {
  try {
    const res     = await fetch(`${API_BASE}/posters/movies`);
    const posters = await res.json();
    containerEl.innerHTML = posters.map(p =>
      `<div class="poster-card">
         <img src="${p.url}" alt="${p.title}" loading="lazy">
         <p>${p.title}</p>
       </div>`
    ).join('');
  } catch (err) {
    console.error('Could not load movie posters:', err);
  }
}

// ============================================================
// STATE
// ============================================================
let currentScreen = 'home';
let orderQty = 1;
let selectedAssist = null;
let selectedAssistLabel = '';
let activeRequest = null;
let etaSeconds = 0;
let etaInterval = null;
let clockInterval = null;
let etaCountdown = 6 * 60 + 22; // 6h 22m in minutes (using minutes display)
const initialFlightEtaSeconds = (6 * 60 + 22) * 60;
const flightTotalSeconds = (13 * 60 + 45) * 60;
let flightEtaSeconds = initialFlightEtaSeconds;
let syncInterval = null;
let toastTimeout = null;
let chatPollInterval = null;
let chatMessages = [];
let chatInitialized = false;
let lavStates = { front: 'available', mid: 'occupied', rear: 'available' };
const bluetoothDevices = [
  { id: 'sony', name: 'Sony WH-1000XM5', battery: 78 },
  { id: 'airpods', name: 'AirPods Pro 2', battery: 64 }
];
let bluetoothState = {
  enabled: true,
  connectedDevice: 'Sony WH-1000XM5',
  battery: 78,
  outputMode: 'bluetooth'
};
const routeWaypoints = [
  { progress: 0.00, label: 'Kuala Lumpur', lat: 2.7, lon: 101.7 },
  { progress: 0.15, label: 'Andaman Sea', lat: 8.9, lon: 96.2 },
  { progress: 0.31, label: 'Bay of Bengal', lat: 15.7, lon: 88.6 },
  { progress: 0.48, label: 'Northwest India', lat: 27.6, lon: 75.0 },
  { progress: 0.63, label: 'Pakistan Corridor', lat: 31.5, lon: 68.8 },
  { progress: 0.80, label: 'Eastern Europe', lat: 45.1, lon: 24.9 },
  { progress: 0.92, label: 'Western Europe', lat: 49.7, lon: 7.8 },
  { progress: 1.00, label: 'London Heathrow', lat: 51.5, lon: -0.5 }
];

// ============================================================
// NAVIGATION
// ============================================================
function navigateTo(screenId) {
  // hide current
  const prev = document.getElementById('screen-' + currentScreen);
  if (prev) prev.classList.remove('active');
  const prevNav = document.getElementById('nav-' + currentScreen);
  if (prevNav) prevNav.classList.remove('active');

  currentScreen = screenId;

  const next = document.getElementById('screen-' + screenId);
  if (next) next.classList.add('active');
  const nextNav = document.getElementById('nav-' + screenId);
  if (nextNav) nextNav.classList.add('active');

  // Special handling
  if (screenId === 'track') refreshTrackScreen();
  if (screenId === 'order') showOrderCategories();
  if (screenId === 'chat') {
    fetchPassengerChatMessages({ silent: true });
    scrollChatToBottom();
  }
}

// ============================================================
// CLOCK
// ============================================================
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  document.getElementById('clock').textContent = h + ':' + m;
}

function updateFlightEta() {
  flightEtaSeconds = Math.max(0, flightEtaSeconds - 1);
  const totalMin = Math.floor(flightEtaSeconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const display = h + 'h ' + String(m).padStart(2,'0') + 'm';
  const etaEl = document.getElementById('eta-display');
  const fiEl = document.getElementById('fi-eta');
  if (etaEl) etaEl.textContent = display;
  if (fiEl) fiEl.textContent = display;

  // Update LHR local time (UTC+1, assume current time + eta offset demo)
  const lhrEl = document.getElementById('fi-lhr-time');
  if (lhrEl) {
    const now = new Date();
    const lhrMs = now.getTime() + (flightEtaSeconds * 1000);
    const lhrDate = new Date(lhrMs);
    // Simulate LHR time (UTC+1)
    const lhrH = String((lhrDate.getUTCHours() + 1) % 24).padStart(2,'0');
    const lhrM = String(lhrDate.getUTCMinutes()).padStart(2,'0');
    lhrEl.textContent = lhrH + ':' + lhrM;
  }

  updateFlightMap();
}

function interpolateRoutePosition(progress) {
  const clamped = Math.min(1, Math.max(0, progress));
  for (let i = 0; i < routeWaypoints.length - 1; i++) {
    const start = routeWaypoints[i];
    const end = routeWaypoints[i + 1];
    if (clamped >= start.progress && clamped <= end.progress) {
      const span = end.progress - start.progress || 1;
      const t = (clamped - start.progress) / span;
      return {
        label: t < 0.55 ? start.label : end.label,
        lat: start.lat + (end.lat - start.lat) * t,
        lon: start.lon + (end.lon - start.lon) * t
      };
    }
  }
  const last = routeWaypoints[routeWaypoints.length - 1];
  return { label: last.label, lat: last.lat, lon: last.lon };
}

function formatCoordinate(value, positiveLabel, negativeLabel) {
  return Math.abs(value).toFixed(1) + 'Ã‚Â°' + (value >= 0 ? positiveLabel : negativeLabel);
}

function updateFlightMap() {
  const progress = Math.min(0.98, Math.max(0.04, (flightTotalSeconds - flightEtaSeconds) / flightTotalSeconds));
  const routePosition = interpolateRoutePosition(progress);
  const percent = Math.round(progress * 100);
  const flownSeconds = flightTotalSeconds - flightEtaSeconds;
  const flownHours = Math.floor(flownSeconds / 3600);
  const flownMins = Math.floor((flownSeconds % 3600) / 60);
  const planeLeft = (progress * 100).toFixed(1) + '%';

  const plane = document.getElementById('plane-on-map');
  const planeLabel = document.getElementById('plane-label');
  const arcProgress = document.getElementById('arc-progress');
  const mapProgressPill = document.getElementById('map-progress-pill');
  const mapLocation = document.getElementById('map-current-location');
  const mapCoords = document.getElementById('map-current-coords');
  const mapProgressText = document.getElementById('map-progress-text');
  const mapProgressSub = document.getElementById('map-progress-sub');

  if (plane) plane.style.left = planeLeft;
  if (planeLabel) {
    planeLabel.style.left = planeLeft;
    planeLabel.textContent = 'Over ' + routePosition.label;
  }
  if (arcProgress) arcProgress.style.width = planeLeft;
  if (mapProgressPill) mapProgressPill.textContent = percent + '% Complete';
  if (mapLocation) mapLocation.textContent = routePosition.label;
  if (mapCoords) mapCoords.textContent = formatCoordinate(routePosition.lat, 'N', 'S') + ', ' + formatCoordinate(routePosition.lon, 'E', 'W');
  if (mapProgressText) mapProgressText.textContent = percent + '%';
  if (mapProgressSub) mapProgressSub.textContent = flownHours + 'h ' + String(flownMins).padStart(2,'0') + 'm flown Ã‚Â· ' + document.getElementById('fi-eta').textContent + ' remaining';
}

// ============================================================
// WATCH TABS
// ============================================================
function setWatchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.watch-tab-content').forEach(c => c.classList.remove('active'));
  const tabContent = document.getElementById('watch-' + tab);
  if (tabContent) tabContent.classList.add('active');
  // find matching tab button
  const buttons = document.querySelectorAll('.tab-btn');
  const tabNames = ['movies','tv','music','games'];
  const idx = tabNames.indexOf(tab);
  if (idx >= 0 && buttons[idx]) buttons[idx].classList.add('active');
}

// ============================================================
// ORDER FLOW
// ============================================================
function showOrderCategories() {
  document.querySelectorAll('.order-state').forEach(s => s.classList.remove('active'));
  document.getElementById('order-categories').classList.add('active');
}
function showOrderItems() {
  document.querySelectorAll('.order-state').forEach(s => s.classList.remove('active'));
  document.getElementById('order-items').classList.add('active');
}
function showOrderDetail() {
  document.querySelectorAll('.order-state').forEach(s => s.classList.remove('active'));
  document.getElementById('order-detail').classList.add('active');
  orderQty = 1;
  document.getElementById('qty-val').textContent = '1';
  document.getElementById('order-note').value = '';
}
function changeQty(delta) {
  orderQty = Math.max(1, Math.min(5, orderQty + delta));
  document.getElementById('qty-val').textContent = orderQty;
}
function showOrderConfirmModal() {
  document.getElementById('modal-icon').textContent = 'Ã¢Ëœâ€¢';
  document.getElementById('modal-title').textContent = 'Confirm Your Order';
  document.getElementById('modal-body').textContent = 'Teh Tarik Ãƒâ€” ' + orderQty + '\nYour order will be sent to cabin crew immediately.';
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}
function placeOrder() {
  closeModal();
  const note = document.getElementById('order-note').value;
  const req = {
    id: Date.now(),
    seat: '14A',
    type: 'order',
    item: 'Teh Tarik',
    qty: orderQty,
    note: note,
    status: 'new',
    timestamp: Date.now(),
    eta: 360,
    icon: 'Ã¢Ëœâ€¢'
  };
  saveRequest(req);
  activeRequest = req;
  etaSeconds = 360;
  startEtaCountdown();
  showActiveBanner();
  document.getElementById('order-badge').classList.add('show');
  showToast('Ã¢Å“â€œ Order placed! Tracking your Teh Tarik.', 'success');
  navigateTo('track');
}

function saveRequest(req) {
  const reqs = JSON.parse(localStorage.getItem('mhskyhub_requests') || '[]');
  // Remove existing from same id if exists
  const filtered = reqs.filter(r => r.id !== req.id);
  filtered.push(req);
  localStorage.setItem('mhskyhub_requests', JSON.stringify(filtered));
}

// ============================================================
// ASSIST
// ============================================================
let assistSelected = null;
let assistIcon = '';

function selectAssist(el, icon, label) {
  document.querySelectorAll('.assist-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  assistSelected = label;
  assistIcon = icon;
}

function sendAssistRequest() {
  if (!assistSelected) {
    showToast('Please select a reason for your request', 'info');
    return;
  }
  const note = document.getElementById('assist-note').value;
  const req = {
    id: Date.now(),
    seat: '14A',
    type: 'assist',
    item: assistSelected,
    qty: 1,
    note: note,
    status: 'new',
    timestamp: Date.now(),
    eta: 240,
    icon: assistIcon
  };
  saveRequest(req);
  activeRequest = req;
  etaSeconds = 240;
  startEtaCountdown();
  showActiveBanner();
  document.getElementById('order-badge').classList.add('show');
  showToast('Ã¢Å“â€œ Assistance requested: ' + assistSelected, 'success');
  navigateTo('track');
  // Reset
  document.querySelectorAll('.assist-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('assist-note').value = '';
  assistSelected = null;
}

// ============================================================
// CHAT
// ============================================================
function scrollChatToBottom() {
  setTimeout(() => {
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 50);
}

function formatChatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function normalizeChatMessages(messages) {
  return (messages || [])
    .map((message, index) => ({
      id: message.id ?? index + 1,
      seat: message.seat || PASSENGER_SEAT,
      from: message.from === 'crew' ? 'crew' : 'passenger',
      text: String(message.text || ''),
      timestamp: message.timestamp || new Date().toISOString()
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function renderPassengerChat(messages) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;

  msgs.innerHTML = messages.map(message =>
    '<div class="msg ' + message.from + '">' +
      '<div class="msg-bubble">' + escapeHtml(message.text) + '</div>' +
      '<div class="msg-time">' + formatChatTime(message.timestamp) + '</div>' +
    '</div>'
  ).join('');
}

async function fetchPassengerChatMessages(options) {
  const silent = options && options.silent === true;

  try {
    const res = await fetch(`${API_BASE}/chat?seat=${encodeURIComponent(PASSENGER_SEAT)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Chat fetch failed: ' + res.status);

    const payload = await res.json();
    const previousLastId = chatMessages.length ? chatMessages[chatMessages.length - 1].id : 0;

    chatMessages = normalizeChatMessages(payload.messages);
    renderPassengerChat(chatMessages);

    if (chatInitialized) {
      const newCrewMessages = chatMessages.filter(message => message.id > previousLastId && message.from === 'crew');
      if (newCrewMessages.length && currentScreen !== 'chat') {
        showToast('New message from crew', 'info');
      }
    } else {
      chatInitialized = true;
    }

    if (!silent || currentScreen === 'chat') scrollChatToBottom();
    return true;
  } catch (err) {
    if (!chatInitialized) {
      chatMessages = normalizeChatMessages(DEFAULT_CHAT_MESSAGES);
      renderPassengerChat(chatMessages);
      chatInitialized = true;
      scrollChatToBottom();
    }
    if (!silent) console.error('Could not load passenger chat:', err);
    return false;
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seat: PASSENGER_SEAT, from: 'passenger', text })
    });
    if (!res.ok) throw new Error('Chat send failed: ' + res.status);

    const payload = await res.json();
    chatMessages = normalizeChatMessages([...chatMessages, payload.message]);
    renderPassengerChat(chatMessages);
    input.value = '';
    scrollChatToBottom();
  } catch (err) {
    showToast('Chat service is unavailable right now', 'info');
    console.error('Could not send passenger chat:', err);
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================
// RATE
// ============================================================
let mainRating = 0;
let miniRatings = { crew:0, food:0, comfort:0, ent:0 };

function setMainRating(n) {
  mainRating = n;
  const stars = document.querySelectorAll('#main-stars .star-btn');
  stars.forEach((s,i) => s.classList.toggle('active', i < n));
}
function setMiniRating(cat, n) {
  miniRatings[cat] = n;
  const stars = document.querySelectorAll('#stars-' + cat + ' .mini-star');
  stars.forEach((s,i) => s.classList.toggle('active', i < n));
}
function submitFeedback() {
  showToast('Ã¢Å“â€œ Thank you for your feedback!', 'success');
}

// ============================================================
// CONTROL
// ============================================================
function refreshBluetoothWidget() {
  const stateTitle = document.getElementById('bt-state-title');
  const powerBtn = document.getElementById('bt-power-btn');
  const deviceName = document.getElementById('bt-device-name');
  const deviceMeta = document.getElementById('bt-device-meta');
  const outputPill = document.getElementById('bt-output-pill');
  const pairingPill = document.getElementById('bt-pairing-pill');
  const disconnectBtn = document.getElementById('bt-disconnect-btn');
  const modeLabelMap = {
    bluetooth: 'Bluetooth Headphones',
    seat: 'Seat Handset',
    speaker: 'Screen Speaker'
  };

  if (stateTitle) stateTitle.textContent = bluetoothState.enabled ? 'Bluetooth On' : 'Bluetooth Off';
  if (powerBtn) {
    powerBtn.textContent = bluetoothState.enabled ? 'On' : 'Off';
    powerBtn.classList.toggle('off', !bluetoothState.enabled);
  }
  if (deviceName) deviceName.textContent = bluetoothState.connectedDevice || 'No Device Connected';
  if (deviceMeta) {
    deviceMeta.textContent = bluetoothState.enabled
      ? (bluetoothState.connectedDevice
        ? 'Connected for seat 14A entertainment Ã‚Â· ' + bluetoothState.battery + '% battery remaining'
        : 'Bluetooth is on and ready to pair with your headphones.')
      : 'Turn Bluetooth back on to reconnect your personal audio device.';
  }
  if (outputPill) {
    const outputText = (!bluetoothState.connectedDevice && bluetoothState.outputMode === 'bluetooth')
      ? 'Pair a Bluetooth Device'
      : modeLabelMap[bluetoothState.outputMode];
    outputPill.textContent = 'Output: ' + outputText;
  }
  if (pairingPill) {
    pairingPill.textContent = !bluetoothState.enabled
      ? 'Bluetooth is turned off'
      : (bluetoothState.connectedDevice ? 'Ready for instant reconnect' : 'Pairing mode available');
  }
  if (disconnectBtn) {
    disconnectBtn.textContent = bluetoothState.connectedDevice ? 'Disconnect' : 'Reconnect';
    disconnectBtn.disabled = !bluetoothState.enabled;
  }

  document.querySelectorAll('.bt-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(bluetoothState.outputMode === 'bluetooth' ? 'bluetooth' : bluetoothState.outputMode));
  });

  bluetoothDevices.forEach(device => {
    const card = document.getElementById('bt-device-' + device.id);
    const status = document.getElementById('bt-status-' + device.id);
    const connected = bluetoothState.enabled && bluetoothState.connectedDevice === device.name;
    if (card) card.classList.toggle('connected', connected);
    if (status) status.textContent = connected ? 'Connected Ã‚Â· ' + device.battery + '% battery' : 'Tap to connect';
  });
}

function toggleBluetoothPower() {
  bluetoothState.enabled = !bluetoothState.enabled;
  if (!bluetoothState.enabled) {
    bluetoothState.connectedDevice = '';
    bluetoothState.outputMode = 'seat';
    showToast('Bluetooth turned off', 'info');
  } else {
    bluetoothState.outputMode = bluetoothState.connectedDevice ? bluetoothState.outputMode : 'bluetooth';
    showToast('Bluetooth ready to pair', 'success');
  }
  refreshBluetoothWidget();
}

function connectBluetoothDevice(name, battery) {
  bluetoothState.enabled = true;
  bluetoothState.connectedDevice = name;
  bluetoothState.battery = battery;
  bluetoothState.outputMode = 'bluetooth';
  refreshBluetoothWidget();
  showToast('Connected to ' + name, 'success');
}

function disconnectBluetoothDevice() {
  if (!bluetoothState.enabled) return;
  if (!bluetoothState.connectedDevice) {
    connectBluetoothDevice(bluetoothDevices[0].name, bluetoothDevices[0].battery);
    return;
  }
  const previous = bluetoothState.connectedDevice;
  bluetoothState.connectedDevice = '';
  bluetoothState.outputMode = 'seat';
  refreshBluetoothWidget();
  showToast(previous + ' disconnected', 'info');
}

function pairNewBluetoothDevice() {
  bluetoothState.enabled = true;
  refreshBluetoothWidget();
  showToast('Bluetooth pairing mode is now discoverable', 'info');
}

function setBluetoothAudioMode(mode, el) {
  if (mode === 'bluetooth' && !bluetoothState.enabled) {
    bluetoothState.enabled = true;
  }
  bluetoothState.outputMode = mode;
  document.querySelectorAll('.bt-mode-btn').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
  refreshBluetoothWidget();
  if (mode === 'bluetooth' && !bluetoothState.connectedDevice) {
    showToast('Pair a Bluetooth device to switch audio output', 'info');
  }
}

function setLightMode(el, mode) {
  document.querySelectorAll('.light-mode-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}
function toggleSwitch(id) {
  const sw = document.getElementById('toggle-' + id);
  if (sw) sw.classList.toggle('on');
}
function setFanVal(v) {
  const labels = ['Off','Low','Med','High'];
  document.getElementById('fan-val').textContent = labels[parseInt(v)] || 'Off';
}
function setSeatPreset(el) {
  document.querySelectorAll('.seat-preset-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}
function savePreferences() {
  showToast('Ã¢Å“â€œ Preferences saved', 'success');
}

// ============================================================
// TRACKING
// ============================================================
function startEtaCountdown() {
  if (etaInterval) clearInterval(etaInterval);
  etaInterval = setInterval(() => {
    if (!activeRequest) return;
    etaSeconds = Math.max(0, etaSeconds - 1);
    activeRequest.eta = etaSeconds;
    saveRequest(activeRequest);
    updateTrackDisplay();
    if (etaSeconds <= 0) {
      clearInterval(etaInterval);
    }
  }, 1000);
}

function updateTrackDisplay() {
  const m = Math.floor(etaSeconds / 60);
  const s = etaSeconds % 60;
  const etaEl = document.getElementById('track-eta');
  if (etaEl) etaEl.textContent = m + ':' + String(s).padStart(2,'0');

  const banner = document.getElementById('banner-eta');
  if (banner) banner.textContent = m + ' min';
}

function refreshTrackScreen() {
  if (!activeRequest) {
    // Check localStorage
    const reqs = JSON.parse(localStorage.getItem('mhskyhub_requests') || '[]');
    const pending = reqs.filter(r => r.status !== 'delivered').pop();
    if (pending) {
      activeRequest = pending;
      etaSeconds = pending.eta || 360;
    }
  }

  if (!activeRequest) {
    document.getElementById('track-empty').style.display = 'block';
    document.getElementById('track-active').style.display = 'none';
    return;
  }

  document.getElementById('track-empty').style.display = 'none';
  document.getElementById('track-active').style.display = 'block';

  document.getElementById('track-icon').textContent = activeRequest.icon || 'Ã¢Ëœâ€¢';
  document.getElementById('track-name').textContent = activeRequest.item + (activeRequest.qty > 1 ? ' Ãƒâ€” ' + activeRequest.qty : '');

  const ago = Math.floor((Date.now() - activeRequest.timestamp) / 60000);
  document.getElementById('track-time').textContent = ago < 1 ? 'just now' : ago + ' min ago';

  updateTrackDisplay();
  updateProgressSteps(activeRequest.status);

  // Show/hide cancel button
  const cancelBtn = document.getElementById('track-cancel-btn');
  if (cancelBtn) {
    cancelBtn.style.display = (activeRequest.status === 'new' || activeRequest.status === 'preparing') ? 'block' : 'none';
  }
}

function updateProgressSteps(status) {
  const stepMap = { 'new':1, 'preparing':2, 'ontheway':3, 'delivered':4 };
  const currentStep = stepMap[status] || 1;

  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById('step-' + i);
    if (!stepEl) continue;
    const dot = stepEl.querySelector('.step-dot');
    const label = stepEl.querySelector('.step-label');
    dot.classList.remove('done','active');
    label.classList.remove('done','active');
    if (i < currentStep) {
      dot.classList.add('done');
      dot.textContent = 'Ã¢Å“â€œ';
      label.classList.add('done');
    } else if (i === currentStep) {
      dot.classList.add('active');
      dot.textContent = 'Ã¢â€”Â';
      label.classList.add('active');
    } else {
      dot.textContent = 'Ã¢â€”Â';
    }
    if (i < 4) {
      const line = document.getElementById('line-' + i);
      if (line) line.classList.toggle('done', i < currentStep);
    }
  }
}

function cancelRequest() {
  if (!activeRequest) return;
  activeRequest.status = 'cancelled';
  saveRequest(activeRequest);
  activeRequest = null;
  if (etaInterval) clearInterval(etaInterval);
  hideActiveBanner();
  document.getElementById('order-badge').classList.remove('show');
  showToast('Request cancelled', 'info');
  refreshTrackScreen();
}

function showActiveBanner() {
  document.getElementById('active-banner').classList.add('show');
}
function hideActiveBanner() {
  document.getElementById('active-banner').classList.remove('show');
}

// ============================================================
// TOILET TOGGLE
// ============================================================
function toggleToilet(zone, event) {
  event.stopPropagation();
  const dot = document.getElementById('toilet-' + zone);
  if (!dot) return;
  dot.classList.toggle('available');
  dot.classList.toggle('occupied');
}

// ============================================================
// LAVATORY (FLIGHT INFO)
// ============================================================
function toggleLav(zone) {
  lavStates[zone] = lavStates[zone] === 'available' ? 'occupied' : 'available';
  const statusEl = document.getElementById('lav-' + zone + '-status');
  if (!statusEl) return;
  if (lavStates[zone] === 'available') {
    statusEl.textContent = 'Ã¢â€”Â Available';
    statusEl.className = 'lav-status available';
  } else {
    statusEl.textContent = 'Ã¢â€”Â Occupied';
    statusEl.className = 'lav-status occupied';
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
  toastTimeout = setTimeout(() => {
    t.className = '';
  }, 3000);
}

// ============================================================
// SYNC FROM CREW
// ============================================================
function syncFromLocalStorage() {
  if (!activeRequest) return;
  const reqs = JSON.parse(localStorage.getItem('mhskyhub_requests') || '[]');
  const updated = reqs.find(r => r.id === activeRequest.id);
  if (!updated) return;

  const prevStatus = activeRequest.status;
  activeRequest.status = updated.status;
  if (updated.eta !== undefined) etaSeconds = updated.eta;

  if (prevStatus !== updated.status) {
    const statusLabels = { preparing:'Crew is preparing your order', ontheway:'Your order is on the way!', delivered:'Your order has been delivered!' };
    if (statusLabels[updated.status]) {
      showToast('Ã¢Å“â€œ ' + statusLabels[updated.status], 'success');
    }
    if (updated.status === 'delivered') {
      activeRequest = null;
      if (etaInterval) clearInterval(etaInterval);
      hideActiveBanner();
      document.getElementById('order-badge').classList.remove('show');
      addHistory(updated);
    }
  }

  if (currentScreen === 'track') refreshTrackScreen();
}

function addHistory(req) {
  const histEl = document.getElementById('track-history');
  if (!histEl) return;
  histEl.style.display = 'block';
  const div = document.createElement('div');
  div.className = 'history-item';
  div.innerHTML = '<div class="history-icon">' + (req.icon||'Ã°Å¸â€œÂ¦') + '</div><div><div class="history-name">' + req.item + '</div><div class="history-meta">Delivered Ã‚Â· Seat 14A</div></div><div class="history-done">Ã¢Å“â€œ</div>';
  histEl.appendChild(div);
}

// ============================================================
// INIT
// ============================================================
function init() {
  updateClock();
  updateFlightMap();
  refreshBluetoothWidget();
  fetchPassengerChatMessages();

  clockInterval = setInterval(() => {
    updateClock();
    updateFlightEta();
  }, 1000);

  syncInterval = setInterval(syncFromLocalStorage, 2000);
  chatPollInterval = setInterval(() => {
    fetchPassengerChatMessages({ silent: currentScreen !== 'chat' });
  }, CHAT_POLL_MS);

  // Check for existing requests on load
  const reqs = JSON.parse(localStorage.getItem('mhskyhub_requests') || '[]');
  const pending = reqs.filter(r => r.status !== 'delivered' && r.status !== 'cancelled').pop();
  if (pending) {
    activeRequest = pending;
    etaSeconds = pending.eta || 0;
    if (etaSeconds > 0) {
      showActiveBanner();
      document.getElementById('order-badge').classList.add('show');
      startEtaCountdown();
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
