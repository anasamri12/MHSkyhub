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
let pendingRequests = [];
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

const ORDER_CATEGORY_ORDER = ['hot_drinks', 'cold_drinks', 'snacks', 'meals', 'comfort_items', 'accessories'];
const ORDER_CATEGORY_META = {
  hot_drinks: {
    label: 'Hot Drinks',
    icon: '\u2615',
    notePlaceholder: 'Any special requests? (e.g. extra hot, less sweet)',
    submitLabel: 'Confirm Order'
  },
  cold_drinks: {
    label: 'Cold Drinks',
    icon: '\uD83E\uDDC3',
    notePlaceholder: 'Any serving notes? (e.g. no ice, extra chilled)',
    submitLabel: 'Confirm Order'
  },
  snacks: {
    label: 'Snacks',
    icon: '\uD83C\uDF6A',
    notePlaceholder: 'Any preferences? (e.g. savoury option, sweet option)',
    submitLabel: 'Confirm Order'
  },
  meals: {
    label: 'Meals',
    icon: '\uD83C\uDF74',
    notePlaceholder: 'Any meal notes? (e.g. lighter portion, serve later if possible)',
    submitLabel: 'Confirm Meal Request'
  },
  comfort_items: {
    label: 'Comfort Items',
    icon: '\uD83D\uDECF',
    notePlaceholder: 'Any comfort preferences? (e.g. for sleep, extra support)',
    submitLabel: 'Send Request'
  },
  accessories: {
    label: 'Accessories',
    icon: '\uD83C\uDFA7',
    notePlaceholder: 'Any device or travel note? (e.g. USB-C phone, arrival form)',
    submitLabel: 'Send Request'
  }
};
let orderCatalog = [];
let orderCatalogLoading = false;
let orderCatalogPromise = null;
let selectedOrderCategory = ORDER_CATEGORY_ORDER[0];
let selectedOrderItem = null;

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

const WATCH_HERO_LIBRARY = {
  movies: {
    'Dune: Part Two': { badge: 'Now Showing', description: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the forces that destroyed his family.', actionLabel: 'Play Now' },
    'Mufasa': { badge: 'Continue Watching', description: "A sweeping origin story that follows Mufasa from his early struggles to his rise as one of the Pride Lands' greatest kings.", actionLabel: 'Play Now' },
    'Interstellar': { badge: 'Continue Watching', description: 'A team of explorers travels beyond our galaxy in search of a future for humanity as Earth becomes increasingly uninhabitable.', actionLabel: 'Resume Film' },
    'Mission: Impossible': { badge: 'Continue Watching', description: 'Ethan Hunt races across continents to stop a rogue AI threat before it falls into the wrong hands.', actionLabel: 'Play Now' },
    'Top Gun: Maverick': { badge: 'Continue Watching', description: 'Pete Maverick Mitchell returns to train a new generation of pilots for a mission that demands everything they have.', actionLabel: 'Play Now' },
    'Barbie': { badge: 'Continue Watching', description: 'Barbie leaves Barbieland for the real world and discovers a playful, heartfelt journey about identity and purpose.', actionLabel: 'Play Now' },
    'Aquaman 2': { badge: 'New Releases', description: 'Aquaman must forge an uneasy alliance to protect Atlantis and his family from a dangerous new enemy.', actionLabel: 'Play Now' },
    'Oppenheimer': { badge: 'New Releases', description: "Christopher Nolan's tense historical drama chronicles the life, ambition, and burden of J. Robert Oppenheimer.", actionLabel: 'Play Now' },
    'Everest': { badge: 'New Releases', description: 'A gripping survival drama based on the 1996 Mount Everest disaster, where courage and endurance are pushed to their limits.', actionLabel: 'Play Now' },
    'Poor Things': { badge: 'New Releases', description: 'A bold, visually inventive tale of reinvention and self-discovery led by an unforgettable central performance.', actionLabel: 'Play Now' },
    'Wonka': { badge: 'New Releases', description: "An imaginative musical adventure exploring the early days of Willy Wonka before he opened the world's most famous chocolate factory.", actionLabel: 'Play Now' },
    'The Creator': { badge: 'New Releases', description: 'A futuristic war thriller in which a soldier must decide the fate of humanity and artificial intelligence.', actionLabel: 'Play Now' }
  },
  tv: {
    'Succession': { badge: 'Popular Series', description: 'A razor-sharp family power struggle inside a global media empire where loyalty shifts as fast as the stock price.', actionLabel: 'Watch Now' },
    'The Bear': { badge: 'Popular Series', description: 'An intense, heartfelt kitchen drama about rebuilding a family sandwich shop under relentless pressure.', actionLabel: 'Watch Now' },
    'Planet Earth III': { badge: 'Popular Series', description: 'A stunning wildlife documentary series capturing extraordinary animal behaviour and fragile ecosystems across the planet.', actionLabel: 'Watch Now' },
    'Ted Lasso': { badge: 'Popular Series', description: 'An optimistic football comedy about kindness, teamwork, and finding belief in unlikely places.', actionLabel: 'Watch Now' },
    'Only Murders': { badge: 'Popular Series', description: 'Three podcast-obsessed neighbours turn amateur sleuths when mysterious crimes hit their building.', actionLabel: 'Watch Now' },
    'Shogun': { badge: 'Popular Series', description: 'An epic historical saga of political intrigue, war, and survival in feudal Japan.', actionLabel: 'Watch Now' },
    'The Boys': { badge: 'Popular Series', description: 'A dark, satirical superhero series where unchecked power and celebrity collide with brutal consequences.', actionLabel: 'Watch Now' },
    'White Lotus': { badge: 'Popular Series', description: 'A sharp social satire set at luxury resorts, where privilege, secrets, and tension simmer beneath the surface.', actionLabel: 'Watch Now' }
  }
};

function normalizeWatchMeta(meta) {
  return String(meta || '')
    .replace(/Â·/g, '·')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWatchCards(tab) {
  const selector = tab === 'movies' ? '#watch-movies .movie-card' : '#watch-tv .show-card';
  return Array.from(document.querySelectorAll(selector));
}

function getWatchCardData(card, tab) {
  const titleSelector = tab === 'movies' ? '.movie-title' : '.show-title';
  const metaSelector = tab === 'movies' ? '.movie-meta' : '.show-meta';
  const title = (card.querySelector(titleSelector)?.textContent || '').trim();
  const meta = normalizeWatchMeta(card.querySelector(metaSelector)?.textContent || '');
  const poster = card.querySelector('img');
  const details = (WATCH_HERO_LIBRARY[tab] && WATCH_HERO_LIBRARY[tab][title]) || {};

  return {
    title,
    meta,
    posterSrc: poster ? poster.getAttribute('src') : '',
    posterAlt: poster ? poster.getAttribute('alt') : `${title} poster`,
    badge: details.badge || (tab === 'movies' ? 'Featured' : 'Series Spotlight'),
    description: details.description || 'Enjoy this title during your journey with uninterrupted inflight entertainment.',
    actionLabel: details.actionLabel || (tab === 'movies' ? 'Play Now' : 'Watch Now')
  };
}

function ensureWatchHeroDescription(hero) {
  const heroInfo = hero.querySelector('.hero-info');
  if (!heroInfo) return null;

  let desc = heroInfo.querySelector('.hero-desc');
  if (!desc) {
    const playBtn = heroInfo.querySelector('.hero-play');
    const candidate = playBtn ? playBtn.previousElementSibling : null;
    if (candidate && !candidate.classList.contains('hero-meta') && !candidate.classList.contains('hero-title') && !candidate.classList.contains('hero-badge')) {
      desc = candidate;
      desc.classList.add('hero-desc');
    } else {
      desc = document.createElement('div');
      desc.className = 'hero-desc';
      if (playBtn) heroInfo.insertBefore(desc, playBtn);
      else heroInfo.appendChild(desc);
    }
  }

  return desc;
}

function createWatchHero(tab) {
  const hero = document.createElement('div');
  hero.className = 'hero-card';
  hero.setAttribute('data-watch-hero', tab);
  hero.innerHTML = `
    <div class="hero-poster"></div>
    <div class="hero-info">
      <div class="hero-badge"></div>
      <div class="hero-title"></div>
      <div class="hero-meta"></div>
      <div class="hero-desc"></div>
      <button class="hero-play" type="button"></button>
    </div>
  `;
  return hero;
}

function getWatchHero(tab) {
  const tabEl = document.getElementById(`watch-${tab}`);
  if (!tabEl) return null;

  let hero = Array.from(tabEl.children).find(child => child.classList && child.classList.contains('hero-card'));
  if (!hero) {
    hero = createWatchHero(tab);
    tabEl.insertBefore(hero, tabEl.firstChild);
  }

  hero.setAttribute('data-watch-hero', tab);
  ensureWatchHeroDescription(hero);
  return hero;
}

function renderWatchHero(tab, card) {
  const hero = getWatchHero(tab);
  const data = getWatchCardData(card, tab);
  if (!hero || !data.title) return;

  const posterWrap = hero.querySelector('.hero-poster');
  const badge = hero.querySelector('.hero-badge');
  const title = hero.querySelector('.hero-title');
  const meta = hero.querySelector('.hero-meta');
  const desc = ensureWatchHeroDescription(hero);
  const playBtn = hero.querySelector('.hero-play');

  if (posterWrap) {
    posterWrap.innerHTML = '';
    if (data.posterSrc) {
      const image = document.createElement('img');
      image.src = data.posterSrc;
      image.alt = data.posterAlt;
      posterWrap.appendChild(image);
    }
  }

  if (badge) badge.textContent = data.badge.toUpperCase();
  if (title) title.textContent = data.title;
  if (meta) meta.textContent = data.meta;
  if (desc) desc.textContent = data.description;
  if (playBtn) {
    playBtn.innerHTML = '&#9654;&nbsp; ' + data.actionLabel;
    playBtn.onclick = () => showToast((tab === 'movies' ? 'Playing ' : 'Opening ') + data.title, 'info');
  }
}

function activateWatchCard(tab, card) {
  getWatchCards(tab).forEach(item => item.classList.toggle('is-active', item === card));
  renderWatchHero(tab, card);

  const watchScreen = document.getElementById('screen-watch');
  if (watchScreen && watchScreen.scrollTop > 80) {
    watchScreen.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function bindWatchCards(tab) {
  getWatchCards(tab).forEach(card => {
    if (card.dataset.watchBound === 'true') return;

    card.dataset.watchBound = 'true';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => activateWatchCard(tab, card));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateWatchCard(tab, card);
      }
    });
  });
}

function initWatchHeroInteractions() {
  ['movies', 'tv'].forEach(tab => {
    bindWatchCards(tab);
    const cards = getWatchCards(tab);
    if (!cards.length) return;
    activateWatchCard(tab, cards[0]);
  });
}

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

function getNextRouteWaypoint(progress) {
  const clamped = Math.min(1, Math.max(0, progress));
  const next = routeWaypoints.find(point => point.progress > clamped + 0.001);
  return next || routeWaypoints[routeWaypoints.length - 1];
}

function projectRoutePositionToGlobe(lat, lon) {
  const x = ((lon + 180) / 360) * 100;
  const y = ((90 - lat) / 180) * 100;
  return {
    x: Math.min(86, Math.max(14, x)),
    y: Math.min(78, Math.max(22, y))
  };
}

function formatCoordinate(value, positiveLabel, negativeLabel) {
  return Math.abs(value).toFixed(1) + '\u00B0' + (value >= 0 ? positiveLabel : negativeLabel);
}

function updateFlightMap() {
  const progress = Math.min(0.98, Math.max(0.04, (flightTotalSeconds - flightEtaSeconds) / flightTotalSeconds));
  const routePosition = interpolateRoutePosition(progress);
  const nextWaypoint = getNextRouteWaypoint(progress);
  const globePosition = projectRoutePositionToGlobe(routePosition.lat, routePosition.lon);
  const percent = Math.round(progress * 100);
  const flownSeconds = flightTotalSeconds - flightEtaSeconds;
  const flownHours = Math.floor(flownSeconds / 3600);
  const flownMins = Math.floor((flownSeconds % 3600) / 60);
  const planeLeft = (progress * 100).toFixed(1) + '%';
  const coordinateLabel = formatCoordinate(routePosition.lat, 'N', 'S') + ', ' + formatCoordinate(routePosition.lon, 'E', 'W');

  const plane = document.getElementById('plane-on-map');
  const planeLabel = document.getElementById('plane-label');
  const arcProgress = document.getElementById('arc-progress');
  const mapProgressPill = document.getElementById('map-progress-pill');
  const mapLocation = document.getElementById('map-current-location');
  const mapCoords = document.getElementById('map-current-coords');
  const mapProgressText = document.getElementById('map-progress-text');
  const mapProgressSub = document.getElementById('map-progress-sub');
  const globeProgressPill = document.getElementById('globe-progress-pill');
  const globeCurrentLocation = document.getElementById('globe-current-location');
  const globeCurrentCoords = document.getElementById('globe-current-coords');
  const globeNextWaypoint = document.getElementById('globe-next-waypoint');
  const globeProgressCopy = document.getElementById('globe-progress-copy');
  const globePlane = document.getElementById('globe-plane');
  const globeMarker = document.getElementById('globe-marker');

  if (plane) plane.style.left = planeLeft;
  if (planeLabel) {
    planeLabel.style.left = planeLeft;
    planeLabel.textContent = 'Over ' + routePosition.label;
  }
  if (arcProgress) arcProgress.style.width = planeLeft;
  if (mapProgressPill) mapProgressPill.textContent = percent + '% Complete';
  if (mapLocation) mapLocation.textContent = routePosition.label;
  if (mapCoords) mapCoords.textContent = coordinateLabel;
  if (mapProgressText) mapProgressText.textContent = percent + '%';
  if (mapProgressSub) mapProgressSub.textContent = flownHours + 'h ' + String(flownMins).padStart(2,'0') + 'm flown · ' + document.getElementById('fi-eta').textContent + ' remaining';
  if (globeProgressPill) globeProgressPill.textContent = percent + '% Along Route';
  if (globeCurrentLocation) globeCurrentLocation.textContent = routePosition.label;
  if (globeCurrentCoords) globeCurrentCoords.textContent = coordinateLabel;
  if (globeNextWaypoint) globeNextWaypoint.textContent = nextWaypoint.label;
  if (globeProgressCopy) globeProgressCopy.textContent = percent + '% complete · ' + nextWaypoint.label + ' is the next route segment.';
  if (globePlane) {
    globePlane.style.left = globePosition.x + '%';
    globePlane.style.top = globePosition.y + '%';
  }
  if (globeMarker) {
    globeMarker.style.left = globePosition.x + '%';
    globeMarker.style.top = globePosition.y + '%';
  }
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
function normalizeOrderMenuItem(item) {
  const category = String(item?.category || '').trim().toLowerCase();
  const meta = ORDER_CATEGORY_META[category] || { icon: '\u2615' };

  return {
    slug: String(item?.slug || `${category || 'item'}-${Date.now()}`),
    category,
    name: String(item?.name || 'Service Item'),
    description: String(item?.description || 'Available on request from cabin crew.'),
    priceLabel: String(item?.priceLabel || item?.price_label || 'Included'),
    icon: String(item?.icon || meta.icon || '\u2615'),
    sortOrder: Number(item?.sortOrder || item?.sort_order || 0)
  };
}

function getOrderItemsByCategory(categoryKey) {
  return orderCatalog.filter(item => item.category === categoryKey);
}

function formatOrderCount(count) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

async function ensureOrderCatalogLoaded() {
  if (orderCatalog.length) return orderCatalog;
  if (orderCatalogPromise) return orderCatalogPromise;

  orderCatalogLoading = true;
  orderCatalogPromise = fetch(`${API_BASE}/menu`, { cache: 'no-store' })
    .then(async res => {
      if (!res.ok) throw new Error(`Order menu request failed: ${res.status}`);
      const payload = await res.json();
      orderCatalog = (payload.items || []).map(normalizeOrderMenuItem);
      return orderCatalog;
    })
    .catch(error => {
      console.error('Could not load onboard menu:', error);
      showToast('Order menu is unavailable right now', 'info');
      orderCatalog = [];
      return orderCatalog;
    })
    .finally(() => {
      orderCatalogLoading = false;
      orderCatalogPromise = null;
    });

  return orderCatalogPromise;
}

function renderOrderPlaceholder(target, title, message) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;

  container.innerHTML = `<div class="order-placeholder"><strong>${title}</strong>${message}</div>`;
}

function renderOrderCategories() {
  const grid = document.getElementById('order-category-grid');
  if (!grid) return;

  grid.innerHTML = ORDER_CATEGORY_ORDER.map(categoryKey => {
    const meta = ORDER_CATEGORY_META[categoryKey];
    const count = getOrderItemsByCategory(categoryKey).length;
    const activeClass = categoryKey === selectedOrderCategory ? ' is-active' : '';
    return `
      <div class="cat-card${activeClass}" onclick="showOrderItems('${categoryKey}')">
        <div class="cat-icon">${meta.icon}</div>
        <div class="cat-name">${meta.label}</div>
        <div class="cat-count">${formatOrderCount(count)}</div>
      </div>
    `;
  }).join('');
}

function renderOrderItems(categoryKey = selectedOrderCategory) {
  const meta = ORDER_CATEGORY_META[categoryKey] || { label: 'Order Onboard' };
  const titleEl = document.getElementById('order-items-title');
  const listEl = document.getElementById('order-items-list');
  if (titleEl) titleEl.textContent = meta.label;
  if (!listEl) return;

  const items = getOrderItemsByCategory(categoryKey);
  if (!items.length) {
    selectedOrderItem = null;
    renderOrderPlaceholder(listEl, meta.label, 'No items are available in this category right now.');
    return;
  }

  if (!selectedOrderItem || selectedOrderItem.category !== categoryKey || !items.some(item => item.slug === selectedOrderItem.slug)) {
    selectedOrderItem = items[0];
  }

  listEl.innerHTML = items.map(item => `
    <div class="item-row" onclick="showOrderDetail('${item.slug}')">
      <div class="item-emoji-box">${item.icon}</div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-desc">${item.description}</div>
      </div>
      <div class="item-price">${item.priceLabel}</div>
      <div class="item-chevron">&#8250;</div>
    </div>
  `).join('');
}

function renderOrderDetail(item = selectedOrderItem) {
  if (!item) return;

  const meta = ORDER_CATEGORY_META[item.category] || ORDER_CATEGORY_META.hot_drinks;
  const iconEl = document.getElementById('order-detail-icon');
  const nameEl = document.getElementById('order-detail-name');
  const priceEl = document.getElementById('order-detail-price');
  const descEl = document.getElementById('order-detail-desc');
  const noteEl = document.getElementById('order-note');
  const confirmBtn = document.getElementById('order-confirm-btn');

  if (iconEl) iconEl.textContent = item.icon || meta.icon;
  if (nameEl) nameEl.textContent = item.name;
  if (priceEl) priceEl.textContent = item.priceLabel;
  if (descEl) descEl.textContent = item.description;
  if (noteEl) noteEl.placeholder = meta.notePlaceholder;
  if (confirmBtn) confirmBtn.textContent = meta.submitLabel;
}

function getOrderEta(item) {
  if (!item) return 300;
  if (item.category === 'meals') return 600;
  if (item.category === 'snacks') return 300;
  if (item.category === 'comfort_items' || item.category === 'accessories') return 240;
  return 300;
}

async function showOrderCategories(categoryKey) {
  if (categoryKey) selectedOrderCategory = categoryKey;
  await ensureOrderCatalogLoaded();
  renderOrderCategories();
  document.querySelectorAll('.order-state').forEach(s => s.classList.remove('active'));
  document.getElementById('order-categories').classList.add('active');
}

async function showOrderItems(categoryKey) {
  if (categoryKey) selectedOrderCategory = categoryKey;
  await ensureOrderCatalogLoaded();
  renderOrderCategories();
  renderOrderItems(selectedOrderCategory);
  document.querySelectorAll('.order-state').forEach(s => s.classList.remove('active'));
  document.getElementById('order-items').classList.add('active');
}

async function showOrderDetail(slug) {
  await ensureOrderCatalogLoaded();

  if (slug) {
    selectedOrderItem = orderCatalog.find(item => item.slug === slug) || null;
    if (selectedOrderItem) selectedOrderCategory = selectedOrderItem.category;
  }

  if (!selectedOrderItem) {
    const items = getOrderItemsByCategory(selectedOrderCategory);
    selectedOrderItem = items[0] || null;
  }

  if (!selectedOrderItem) {
    showOrderItems(selectedOrderCategory);
    return;
  }

  orderQty = 1;
  document.getElementById('qty-val').textContent = '1';
  document.getElementById('order-note').value = '';
  renderOrderDetail(selectedOrderItem);
  document.querySelectorAll('.order-state').forEach(s => s.classList.remove('active'));
  document.getElementById('order-detail').classList.add('active');
}

function changeQty(delta) {
  orderQty = Math.max(1, Math.min(5, orderQty + delta));
  document.getElementById('qty-val').textContent = orderQty;
}

function showOrderConfirmModal() {
  if (!selectedOrderItem) {
    showToast('Please choose an item first', 'info');
    return;
  }

  const note = document.getElementById('order-note').value.trim();
  const isRequestCategory = ['comfort_items', 'accessories'].includes(selectedOrderItem.category);
  document.getElementById('modal-icon').textContent = selectedOrderItem.icon || '\u2615';
  document.getElementById('modal-title').textContent = isRequestCategory ? 'Confirm Your Request' : 'Confirm Your Order';
  document.getElementById('modal-body').textContent = [
    `${selectedOrderItem.name} ? ${orderQty}`,
    note ? `Note: ${note}` : '',
    'Your request will be sent to cabin crew immediately.'
  ].filter(Boolean).join('\n');
  document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

function placeOrder() {
  if (!selectedOrderItem) return;

  closeModal();
  const note = document.getElementById('order-note').value.trim();
  const eta = getOrderEta(selectedOrderItem);
  const req = {
    id: Date.now(),
    seat: PASSENGER_SEAT,
    type: 'order',
    item: selectedOrderItem.name,
    qty: orderQty,
    note,
    status: 'new',
    timestamp: Date.now(),
    eta,
    icon: selectedOrderItem.icon
  };

  saveRequest(req);
  activeRequest = req;
  etaSeconds = eta;
  startEtaCountdown();
  showActiveBanner();
  document.getElementById('order-badge').classList.add('show');
  showToast(`${selectedOrderItem.name} requested. Tracking now live.`, 'success');
  navigateTo('track');
}

// ============================================================
// ASSIST
// ============================================================
let assistSelected = null;
let assistIcon = '';
const ASSIST_ICONS = {
  blanket: '\uD83D\uDECF',
  water: '\uD83D\uDCA7',
  cleaning: '\uD83E\uDDF9',
  headset: '\uD83C\uDFA7',
  medical: '\uD83D\uDC8A',
  child: '\uD83D\uDC76',
  toiletries: '\uD83E\uDDF4',
  accessibility: '\u267F',
  other: '\u2753'
};

function selectAssist(el, icon, label) {
  document.querySelectorAll('.assist-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  assistSelected = label;
  assistIcon = ASSIST_ICONS[icon] || icon;
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
  showToast('Assistance requested: ' + assistSelected, 'success');
  navigateTo('track');
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
  showToast('Thank you for your feedback!', 'success');
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
        ? 'Connected for seat 14A entertainment - ' + bluetoothState.battery + '% battery remaining'
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
    if (status) status.textContent = connected ? 'Connected - ' + device.battery + '% battery' : 'Tap to connect';
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
  showToast('Preferences saved', 'success');
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


function getRequestRemainingEtaSeconds(request) {
  if (!request) return 0;

  const baseEta = Math.max(0, Number(request.eta || 0));
  const updatedAt = Number(request.updatedAt || request.timestamp || Date.now());
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  return Math.max(0, baseEta - elapsedSeconds);
}

function formatEtaDisplay(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0));
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return {
    clock: m + ':' + String(s).padStart(2, '0'),
    banner: m + ' min'
  };
}

function isTrackRequestPending(request) {
  if (!request) return false;
  const status = String(request.status || '').toLowerCase();
  return !['cancelled', 'completed', 'delivered'].includes(status);
}

function sortTrackRequests(requestsList) {
  return [...requestsList].sort((a, b) => {
    const aTime = Number(a.updatedAt || a.timestamp || 0);
    const bTime = Number(b.updatedAt || b.timestamp || 0);
    if (aTime !== bTime) return bTime - aTime;
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function getPendingTrackRequests() {
  const requestsList = Array.isArray(pendingRequests) ? pendingRequests.filter(isTrackRequestPending) : [];
  if (activeRequest && isTrackRequestPending(activeRequest) && !requestsList.some(req => Number(req.id) === Number(activeRequest.id))) {
    requestsList.unshift({ ...activeRequest });
  }
  return sortTrackRequests(requestsList);
}

function formatTrackStatus(status) {
  const labels = {
    new: 'Received',
    preparing: 'Preparing',
    inprogress: 'Preparing',
    ontheway: 'On the Way'
  };
  return labels[String(status || '').toLowerCase()] || 'In Progress';
}

function selectTrackRequest(requestId) {
  const nextRequest = getPendingTrackRequests().find(req => Number(req.id) === Number(requestId));
  if (!nextRequest) return;

  const changed = !activeRequest || Number(activeRequest.id) !== Number(nextRequest.id);
  activeRequest = { ...nextRequest };

  if (changed) {
    etaSeconds = getRequestRemainingEtaSeconds(activeRequest);
    if (etaSeconds > 0) startEtaCountdown();
  }

  refreshTrackScreen();
}

function renderTrackQueue(requestsList) {
  const section = document.getElementById('track-queue-section');
  const queueEl = document.getElementById('track-queue');
  if (!section || !queueEl) return;

  const otherRequests = requestsList.filter(req => !activeRequest || Number(req.id) !== Number(activeRequest.id));
  if (!otherRequests.length) {
    section.style.display = 'none';
    queueEl.innerHTML = '';
    return;
  }

  section.style.display = 'block';
  queueEl.innerHTML = otherRequests.map(req => {
    const submittedMins = Math.max(0, Math.floor((Date.now() - Number(req.timestamp || Date.now())) / 60000));
    const etaLabel = Math.max(1, Math.ceil(getRequestRemainingEtaSeconds(req) / 60));
    const submittedLabel = submittedMins < 1 ? 'Submitted just now' : `Submitted ${submittedMins} min ago`;
    return `
      <button type="button" class="track-queue-item" onclick="selectTrackRequest(${Number(req.id)})">
        <div class="track-item-icon">${req.icon || '\u2615'}</div>
        <div class="track-queue-copy">
          <div class="track-queue-name">${req.item}${req.qty > 1 ? ` \u00D7 ${req.qty}` : ''}</div>
          <div class="track-queue-meta">${formatTrackStatus(req.status)} \u00B7 ${submittedLabel}</div>
        </div>
        <div class="track-queue-pill">~${etaLabel} min</div>
      </button>
    `;
  }).join('');
}

function updateTrackDisplay() {
  const display = formatEtaDisplay(etaSeconds);
  const etaEl = document.getElementById('track-eta');
  if (etaEl) etaEl.textContent = display.clock;

  const banner = document.getElementById('banner-eta');
  if (banner) banner.textContent = display.banner;
}

function refreshTrackScreen() {
  const requestsList = getPendingTrackRequests();

  if (activeRequest) {
    const matchingRequest = requestsList.find(req => Number(req.id) === Number(activeRequest.id));
    if (matchingRequest) {
      activeRequest = {
        ...matchingRequest,
        eta: etaSeconds > 0 ? Math.min(getRequestRemainingEtaSeconds(matchingRequest), etaSeconds) : getRequestRemainingEtaSeconds(matchingRequest)
      };
    } else {
      activeRequest = null;
    }
  }

  if (!activeRequest && requestsList.length) {
    activeRequest = { ...requestsList[0] };
    etaSeconds = getRequestRemainingEtaSeconds(activeRequest);
    if (etaSeconds > 0) startEtaCountdown();
  }

  if (!activeRequest) {
    document.getElementById('track-empty').style.display = 'block';
    document.getElementById('track-active').style.display = 'none';
    renderTrackQueue([]);
    return;
  }

  document.getElementById('track-empty').style.display = 'none';
  document.getElementById('track-active').style.display = 'block';

  document.getElementById('track-icon').textContent = activeRequest.icon || '\u2615';
  document.getElementById('track-name').textContent = activeRequest.item + (activeRequest.qty > 1 ? ' \u00D7 ' + activeRequest.qty : '');

  const ago = Math.floor((Date.now() - Number(activeRequest.timestamp || Date.now())) / 60000);
  document.getElementById('track-time').textContent = ago < 1 ? 'just now' : ago + ' min ago';

  updateTrackDisplay();
  updateProgressSteps(activeRequest.status);
  renderTrackQueue(requestsList);

  const cancelBtn = document.getElementById('track-cancel-btn');
  if (cancelBtn) {
    cancelBtn.style.display = ['new', 'preparing', 'inprogress'].includes(String(activeRequest.status || '').toLowerCase()) ? 'block' : 'none';
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
      dot.textContent = '\u2713';
      label.classList.add('done');
    } else if (i === currentStep) {
      dot.classList.add('active');
      dot.textContent = '\u25CF';
      label.classList.add('active');
    } else {
      dot.textContent = '\u25CF';
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
    statusEl.textContent = '\u25CF Available';
    statusEl.className = 'lav-status available';
  } else {
    statusEl.textContent = '\u25CF Occupied';
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
      showToast(statusLabels[updated.status], 'success');
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
  div.innerHTML = '<div class="history-icon">' + (req.icon||'\u2615') + '</div><div><div class="history-name">' + req.item + '</div><div class="history-meta">Delivered - Seat 14A</div></div><div class="history-done">\u2713</div>';
  histEl.appendChild(div);
}

// ============================================================
// INIT
// ============================================================
function init() {
  updateClock();
  updateFlightMap();
  refreshBluetoothWidget();
  initWatchHeroInteractions();
  fetchPassengerChatMessages();
  ensureOrderCatalogLoaded().catch(() => {});

  clockInterval = setInterval(() => {
    updateClock();
    updateFlightEta();
  }, 1000);

  if (syncInterval) clearInterval(syncInterval);
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
