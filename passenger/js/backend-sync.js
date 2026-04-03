try {
  localStorage.removeItem('mhskyhub_requests');
} catch (error) {
  console.warn('Could not clear legacy passenger localStorage cache:', error);
}

const PASSENGER_REQUEST_SYNC_MS = 15000;
let passengerSocket = null;
let passengerRequestPoll = null;
const passengerCompletedHistory = new Set();

function isPassengerRequestActive(status) {
  return !['cancelled', 'completed', 'delivered'].includes(String(status || '').toLowerCase());
}

function normalizePassengerRequest(request) {
  if (!request) return null;

  return {
    ...request,
    seat: String(request.seat || PASSENGER_SEAT).trim().toUpperCase(),
    qty: Number(request.qty || 1),
    eta: Number(request.eta || 0),
    timestamp: Number(request.timestamp || Date.now()),
    updatedAt: Number(request.updatedAt || Date.now())
  };
}

function sortPassengerMessages(messages) {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return Number(a.id || 0) - Number(b.id || 0);
  });
}

function mergePassengerChatMessage(message) {
  const normalized = normalizeChatMessages([message])[0];
  if (!normalized) return false;

  const exists = chatMessages.some(entry => Number(entry.id) === Number(normalized.id));
  if (exists) return false;

  chatMessages = sortPassengerMessages([...chatMessages, normalized]);
  renderPassengerChat(chatMessages);
  if (currentScreen === 'chat') scrollChatToBottom();
  return true;
}

async function fetchPassengerRequestsFromApi() {
  const res = await fetch(`${API_BASE}/requests?seat=${encodeURIComponent(PASSENGER_SEAT)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Passenger request fetch failed: ${res.status}`);
  const payload = await res.json();
  return (payload.requests || []).map(normalizePassengerRequest);
}

function sortPassengerRequests(requestsList) {
  return [...requestsList].sort((a, b) => {
    const aTime = Number(a.updatedAt || a.timestamp || 0);
    const bTime = Number(b.updatedAt || b.timestamp || 0);
    if (aTime !== bTime) return bTime - aTime;
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function getActivePassengerRequests(requestsList) {
  return sortPassengerRequests((requestsList || []).filter(request => isPassengerRequestActive(request.status)));
}

function clearPassengerActiveState() {
  activeRequest = null;
  etaSeconds = 0;
  if (etaInterval) {
    clearInterval(etaInterval);
    etaInterval = null;
  }
  hideActiveBanner();
  const badge = document.getElementById('order-badge');
  if (badge) badge.classList.remove('show');
}

function notifyPassengerStatusChange(status) {
  const labels = {
    preparing: 'Crew is preparing your request',
    inprogress: 'Crew is preparing your request',
    ontheway: 'Your request is on the way',
    delivered: 'Your request has been delivered',
    completed: 'Your request has been completed',
    cancelled: 'Your request has been cancelled'
  };

  if (labels[status]) {
    showToast(labels[status], status === 'cancelled' ? 'info' : 'success');
  }
}

function syncPassengerRequestHistory(requestsList) {
  (requestsList || []).forEach(request => {
    const normalized = normalizePassengerRequest(request);
    if (!normalized) return;

    const status = String(normalized.status || '').toLowerCase();
    if (['delivered', 'completed'].includes(status) && !passengerCompletedHistory.has(normalized.id)) {
      addHistory(normalized);
      passengerCompletedHistory.add(normalized.id);
    }
  });
}

function setPassengerPendingRequests(requestsList, options = {}) {
  const previous = activeRequest ? { ...activeRequest } : null;
  const preferredId = options.preferredId != null
    ? Number(options.preferredId)
    : (previous ? Number(previous.id) : null);

  pendingRequests = getActivePassengerRequests((requestsList || []).map(normalizePassengerRequest).filter(Boolean));
  const nextActive = pendingRequests.find(request => Number(request.id) === preferredId) || pendingRequests[0] || null;

  if (!nextActive) {
    pendingRequests = [];
    clearPassengerActiveState();
    refreshTrackScreen();
    return null;
  }

  activeRequest = { ...nextActive };
  const incomingEta = typeof getRequestRemainingEtaSeconds === 'function'
    ? getRequestRemainingEtaSeconds(nextActive)
    : Number(nextActive.eta || 0);

  if (!previous || Number(previous.id) !== Number(activeRequest.id)) {
    etaSeconds = incomingEta;
    if (etaSeconds > 0) startEtaCountdown();
  } else {
    if (previous.status !== activeRequest.status) {
      notifyPassengerStatusChange(activeRequest.status);
      etaSeconds = incomingEta;
      if (etaSeconds > 0) startEtaCountdown();
    } else if (Number.isFinite(incomingEta) && incomingEta >= 0) {
      if (etaSeconds <= 0 || incomingEta === 0 || incomingEta < etaSeconds) {
        etaSeconds = incomingEta;
      }
    }
  }

  activeRequest.eta = etaSeconds;
  showActiveBanner();
  const badge = document.getElementById('order-badge');
  if (badge) badge.classList.add('show');
  refreshTrackScreen();
  return activeRequest;
}

function applyPassengerRequestUpdate(request, options = {}) {
  const normalized = normalizePassengerRequest(request);
  if (!normalized) {
    syncPassengerRequests(true);
    return;
  }

  const status = String(normalized.status || '').toLowerCase();
  if (['delivered', 'completed'].includes(status) && !passengerCompletedHistory.has(normalized.id)) {
    addHistory(normalized);
    passengerCompletedHistory.add(normalized.id);
  }

  if (status === 'cancelled') {
    const remaining = pendingRequests.filter(entry => Number(entry.id) !== Number(normalized.id));
    setPassengerPendingRequests(remaining, { preferredId: remaining[0] ? remaining[0].id : null });
    return;
  }

  const merged = sortPassengerRequests([
    ...pendingRequests.filter(entry => Number(entry.id) !== Number(normalized.id)),
    normalized
  ]);

  setPassengerPendingRequests(merged, {
    preferredId: options.focusIncoming ? normalized.id : (activeRequest ? activeRequest.id : normalized.id)
  });
}

async function syncPassengerRequests(silent) {
  const quiet = silent === true;

  try {
    const requestsList = await fetchPassengerRequestsFromApi();
    const previous = activeRequest ? { ...activeRequest } : null;
    syncPassengerRequestHistory(requestsList);

    if (previous) {
      const snapshot = requestsList.find(request => Number(request.id) === Number(previous.id));
      if (snapshot && String(snapshot.status || '').toLowerCase() !== String(previous.status || '').toLowerCase()) {
        notifyPassengerStatusChange(String(snapshot.status || '').toLowerCase());
      }
    }

    const activeRequests = getActivePassengerRequests(requestsList);
    if (!activeRequests.length) {
      pendingRequests = [];
      clearPassengerActiveState();
      refreshTrackScreen();
      return true;
    }

    const preferredId = previous && activeRequests.some(request => Number(request.id) === Number(previous.id))
      ? previous.id
      : activeRequests[0].id;

    setPassengerPendingRequests(activeRequests, { preferredId });
    return true;
  } catch (error) {
    if (!quiet) console.error('Could not sync passenger requests:', error);
    return false;
  }
}

saveRequest = function saveRequestToBackend(request) {
  const payload = normalizePassengerRequest(request);

  fetch(`${API_BASE}/requests/${encodeURIComponent(payload.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(async res => {
      if (!res.ok) throw new Error(`Passenger request save failed: ${res.status}`);
      const response = await res.json();
      applyPassengerRequestUpdate(response.request, { focusIncoming: true });
    })
    .catch(error => {
      console.error('Could not save passenger request:', error);
      showToast('Request service is unavailable right now', 'info');
    });
};

startEtaCountdown = function startRealtimeEtaCountdown() {
  if (etaInterval) clearInterval(etaInterval);

  etaInterval = setInterval(() => {
    if (!activeRequest || !isPassengerRequestActive(activeRequest.status)) return;

    etaSeconds = Math.max(0, etaSeconds - 1);
    activeRequest.eta = etaSeconds;
    updateTrackDisplay();

    if (etaSeconds <= 0) {
      clearInterval(etaInterval);
      etaInterval = null;
    }
  }, 1000);
};

syncFromLocalStorage = function syncPassengerFromBackend() {
  syncPassengerRequests(true);
};

cancelRequest = function cancelPassengerRequest() {
  if (!activeRequest) return;

  const requestId = activeRequest.id;
  fetch(`${API_BASE}/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seat: PASSENGER_SEAT, status: 'cancelled', eta: 0 })
  })
    .then(async res => {
      if (!res.ok) throw new Error(`Passenger request cancel failed: ${res.status}`);
      const response = await res.json();
      const remaining = pendingRequests.filter(entry => Number(entry.id) !== Number(requestId));
      setPassengerPendingRequests(remaining, { preferredId: remaining[0] ? remaining[0].id : null });
      showToast('Request cancelled', 'info');
      if (response && response.request) syncPassengerRequests(true);
    })
    .catch(error => {
      console.error('Could not cancel passenger request:', error);
      showToast('Unable to cancel the request right now', 'info');
    });
};

function connectPassengerRealtime() {
  if (typeof io !== 'function' || passengerSocket) return;

  passengerSocket = io({
    auth: {
      role: 'passenger',
      seat: PASSENGER_SEAT
    }
  });

  passengerSocket.on('connect', () => {
    passengerSocket.emit('seat:join', PASSENGER_SEAT);
  });

  passengerSocket.on('chat:message', message => {
    if (String(message.seat || '').trim().toUpperCase() !== PASSENGER_SEAT) return;

    const added = mergePassengerChatMessage(message);
    if (added && message.from === 'crew' && currentScreen !== 'chat') {
      showToast('New message from crew', 'info');
    }
  });

  passengerSocket.on('request:created', request => {
    if (String(request.seat || '').trim().toUpperCase() !== PASSENGER_SEAT) return;
    syncPassengerRequests(true);
  });

  passengerSocket.on('request:updated', request => {
    if (String(request.seat || '').trim().toUpperCase() !== PASSENGER_SEAT) return;
    syncPassengerRequests(true);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  syncPassengerRequests(true);
  connectPassengerRealtime();

  if (passengerRequestPoll) clearInterval(passengerRequestPoll);
  passengerRequestPoll = setInterval(() => {
    syncPassengerRequests(true);
  }, PASSENGER_REQUEST_SYNC_MS);
});
