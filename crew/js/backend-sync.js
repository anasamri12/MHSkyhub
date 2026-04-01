try {
  localStorage.removeItem('mhskyhub_requests');
} catch (error) {
  console.warn('Could not clear legacy crew localStorage cache:', error);
}

const CREW_REQUEST_SYNC_MS = 5000;
let crewSocket = null;
let crewRequestPoll = null;

function normalizeCrewRequest(request) {
  if (!request) return null;

  return {
    ...request,
    seat: normalizeSeatCode(request.seat || ''),
    qty: Number(request.qty || 1),
    eta: Number(request.eta || 0),
    timestamp: Number(request.timestamp || Date.now()),
    updatedAt: Number(request.updatedAt || Date.now())
  };
}

function mergeCrewChatMessage(message) {
  const normalized = normalizeCrewChatMessages([message])[0];
  if (!normalized) return false;

  const exists = crewChatMessages.some(entry => Number(entry.id) === Number(normalized.id));
  if (exists) return false;

  crewChatMessages = normalizeCrewChatMessages([...crewChatMessages, normalized]);
  renderCrewChatMessages(crewChatMessages);
  scrollCrewChatToBottom();
  return true;
}

function replaceCrewRequests(nextRequests, options) {
  const settings = options || {};
  const previousIds = new Set(requests.map(request => request.id));
  const previousSelectedId = selectedRequestId;

  requests = [...nextRequests]
    .map(normalizeCrewRequest)
    .filter(Boolean)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

  updateBadges();
  renderSidebar();
  renderCabinMap();

  if (previousSelectedId !== null) {
    const stillExists = requests.some(request => request.id === previousSelectedId);
    if (stillExists) {
      selectRequest(previousSelectedId);
    } else {
      closeDetail();
    }
  }

  if (!settings.silent) {
    const newest = requests.find(request => !previousIds.has(request.id));
    if (newest) {
      showToast(`New request from Seat ${newest.seat} - ${newest.item}`, 'alert');
    }
  }
}

async function fetchCrewRequestsFromApi(silent) {
  const quiet = silent === true;

  try {
    const res = await fetch(`${API_BASE}/requests`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Crew request fetch failed: ${res.status}`);

    const payload = await res.json();
    replaceCrewRequests(payload.requests || [], { silent: quiet });
    return true;
  } catch (error) {
    if (!quiet) console.error('Could not sync crew requests:', error);
    return false;
  }
}

loadRequests = function loadRequestsFromBackend() {
  requests = [...DEFAULT_REQUESTS].map(normalizeCrewRequest);
  fetchCrewRequestsFromApi(true);
};

syncFromPassenger = function syncCrewFromBackend() {
  fetchCrewRequestsFromApi(true);
};

syncStatusToPassenger = function syncCrewStatusToBackend(request) {
  const payload = normalizeCrewRequest(request);

  fetch(`${API_BASE}/requests/${encodeURIComponent(payload.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seat: payload.seat,
      type: payload.type,
      item: payload.item,
      qty: payload.qty,
      note: payload.note,
      status: payload.status,
      eta: payload.eta,
      icon: payload.icon,
      priority: payload.priority
    })
  })
    .then(async res => {
      if (!res.ok) throw new Error(`Crew status update failed: ${res.status}`);
      const response = await res.json();
      const merged = requests.map(entry => (entry.id === response.request.id ? normalizeCrewRequest(response.request) : entry));
      replaceCrewRequests(merged, { silent: true });
    })
    .catch(error => {
      console.error('Could not update crew request:', error);
      showToast('Could not update the request right now', 'info');
      fetchCrewRequestsFromApi(true);
    });
};

function connectCrewRealtime() {
  if (typeof io !== 'function' || crewSocket) return;

  crewSocket = io({
    auth: {
      role: 'crew'
    }
  });

  crewSocket.on('connect', () => {
    crewSocket.emit('crew:join');
  });

  crewSocket.on('request:created', request => {
    const exists = requests.some(entry => entry.id === request.id);
    const nextRequests = exists
      ? requests.map(entry => (entry.id === request.id ? normalizeCrewRequest(request) : entry))
      : [normalizeCrewRequest(request), ...requests];

    replaceCrewRequests(nextRequests, { silent: exists });
  });

  crewSocket.on('request:updated', request => {
    const exists = requests.some(entry => entry.id === request.id);
    const nextRequests = exists
      ? requests.map(entry => (entry.id === request.id ? normalizeCrewRequest(request) : entry))
      : [normalizeCrewRequest(request), ...requests];

    replaceCrewRequests(nextRequests, { silent: true });
  });

  crewSocket.on('chat:message', message => {
    const seat = normalizeChatSeat(message.seat);

    if (seat === crewChatSeat) {
      const added = mergeCrewChatMessage(message);
      if (added && message.from === 'passenger') {
        showToast(`New chat from Seat ${seat}`, 'alert');
      }
    }

    fetchCrewChatThreads(true);
  });

  crewSocket.on('chat:thread-updated', payload => {
    const seat = normalizeChatSeat(payload && payload.seat);
    fetchCrewChatThreads(true);
    if (seat === crewChatSeat) {
      fetchCrewChatMessages(true);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  fetchCrewRequestsFromApi(true);
  connectCrewRealtime();

  if (crewRequestPoll) clearInterval(crewRequestPoll);
  crewRequestPoll = setInterval(() => {
    fetchCrewRequestsFromApi(true);
  }, CREW_REQUEST_SYNC_MS);
});
