const PASSENGER_AUTH_STORAGE_KEY = 'mhskyhub_passenger_enrich_v1';
let passengerAuthMode = 'signin';
let passengerAuthSession = null;
let passengerAuthNotice = { message: '', type: '' };
let defaultPassengerDisplayName = 'Yusuf Al-Rahman';

function readPassengerAuthStorage() {
  try {
    return JSON.parse(localStorage.getItem(PASSENGER_AUTH_STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function writePassengerAuthStorage(session) {
  localStorage.setItem(PASSENGER_AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearPassengerAuthStorage() {
  localStorage.removeItem(PASSENGER_AUTH_STORAGE_KEY);
}

function setPassengerDisplayName(name) {
  const target = document.querySelector('#screen-home .passenger-name');
  if (target) target.textContent = name || defaultPassengerDisplayName;
}

function setPassengerAuthNotice(message, type) {
  passengerAuthNotice = {
    message: String(message || '').trim(),
    type: String(type || '').trim()
  };

  const statusEl = document.getElementById('enrich-auth-status');
  if (!statusEl) return;

  statusEl.textContent = passengerAuthNotice.message;
  statusEl.className = 'enrich-auth-status' + (passengerAuthNotice.type ? ' ' + passengerAuthNotice.type : '');
}

function openPassengerAuthScreen() {
  navigateTo('enrichauth');
}

function renderPassengerAuthUi() {
  const launch = document.getElementById('enrich-profile-launch');
  const launchAvatar = document.getElementById('enrich-profile-avatar');
  const launchEyebrow = document.getElementById('enrich-profile-eyebrow');
  const launchTitle = document.getElementById('enrich-profile-title');
  const launchSub = document.getElementById('enrich-profile-sub');
  const tabsWrap = document.getElementById('enrich-auth-tabs');
  const tabs = Array.from(document.querySelectorAll('#enrich-auth-tabs .enrich-tab'));
  const signInForm = document.getElementById('enrich-signin-form');
  const signUpForm = document.getElementById('enrich-signup-form');
  const guestPanel = document.getElementById('enrich-guest-panel');
  const memberPanel = document.getElementById('enrich-member-panel');
  const memberName = document.getElementById('enrich-member-name');
  const memberId = document.getElementById('enrich-member-id');

  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === passengerAuthMode));

  if (passengerAuthSession && passengerAuthSession.user) {
    const name = passengerAuthSession.user.displayName || defaultPassengerDisplayName;
    const enrichId = passengerAuthSession.user.enrichId || 'Pending Enrich ID';
    const tier = passengerAuthSession.user.tier || 'Enrich Explorer';

    if (launch) launch.classList.add('signed-in');
    if (launchAvatar) launchAvatar.classList.add('is-linked');
    if (launchEyebrow) launchEyebrow.textContent = 'Enrich Member';
    if (launchTitle) launchTitle.textContent = name;
    if (launchSub) launchSub.textContent = `${tier} \u00B7 ${enrichId} \u00B7 Tap to view your account.`;

    if (tabsWrap) tabsWrap.style.display = 'none';
    if (guestPanel) guestPanel.style.display = 'none';
    if (memberPanel) memberPanel.style.display = 'flex';
    if (memberName) memberName.textContent = name;
    if (memberId) memberId.textContent = `Enrich ID ${enrichId} \u00B7 Tier ${tier}`;
    setPassengerDisplayName(name);
  } else {
    if (launch) launch.classList.remove('signed-in');
    if (launchAvatar) launchAvatar.classList.remove('is-linked');
    if (launchEyebrow) launchEyebrow.textContent = 'Optional Enrich Access';
    if (launchTitle) launchTitle.textContent = 'Sign In to Enrich';
    if (launchSub) launchSub.textContent = 'Tap to link your Malaysia Airlines account, access benefits, or create an account.';

    if (tabsWrap) tabsWrap.style.display = 'flex';
    if (guestPanel) guestPanel.style.display = 'block';
    if (memberPanel) memberPanel.style.display = 'none';
    if (signInForm) signInForm.style.display = passengerAuthMode === 'signin' ? 'flex' : 'none';
    if (signUpForm) signUpForm.style.display = passengerAuthMode === 'signup' ? 'flex' : 'none';
    setPassengerDisplayName(defaultPassengerDisplayName);
  }

  setPassengerAuthNotice(passengerAuthNotice.message, passengerAuthNotice.type);
}

function setPassengerAuthMode(mode) {
  passengerAuthMode = mode === 'signup' ? 'signup' : 'signin';
  passengerAuthNotice = { message: '', type: '' };
  renderPassengerAuthUi();
}

async function restorePassengerAuthSession() {
  const stored = readPassengerAuthStorage();
  if (!stored || !stored.token) {
    renderPassengerAuthUi();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${stored.token}` },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`Passenger auth restore failed: ${res.status}`);

    const payload = await res.json();
    if (!payload.user || payload.user.role !== 'passenger') throw new Error('Passenger account required');

    passengerAuthSession = { token: stored.token, user: payload.user };
    writePassengerAuthStorage(passengerAuthSession);
    passengerAuthNotice = { message: '', type: '' };
  } catch (error) {
    passengerAuthSession = null;
    clearPassengerAuthStorage();
    passengerAuthNotice = { message: 'Continue as guest or sign in to Enrich again.', type: 'info' };
  }

  renderPassengerAuthUi();
}

async function submitPassengerSignIn(event) {
  event.preventDefault();

  const identifier = document.getElementById('enrich-login-identifier')?.value.trim() || '';
  const password = document.getElementById('enrich-login-password')?.value || '';
  if (!identifier || !password) {
    setPassengerAuthNotice('Please enter your Enrich ID or email and password.', 'error');
    return;
  }

  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || `Passenger sign-in failed: ${res.status}`);
    if (!payload.user || payload.user.role !== 'passenger') throw new Error('Passenger Enrich sign-in only');

    passengerAuthSession = { token: payload.token, user: payload.user };
    writePassengerAuthStorage(passengerAuthSession);
    passengerAuthNotice = { message: 'Enrich account linked for this journey.', type: 'success' };
    renderPassengerAuthUi();
    showToast('Signed in to Enrich', 'success');
  } catch (error) {
    console.error('Passenger sign-in failed:', error);
    setPassengerAuthNotice(error.message || 'Unable to sign in right now.', 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function submitPassengerSignUp(event) {
  event.preventDefault();

  const displayName = document.getElementById('enrich-signup-name')?.value.trim() || '';
  const email = document.getElementById('enrich-signup-email')?.value.trim() || '';
  const password = document.getElementById('enrich-signup-password')?.value || '';
  if (!email || !password) {
    setPassengerAuthNotice('Email and password are required to create the Enrich account.', 'error');
    return;
  }

  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, email, password, seat: PASSENGER_SEAT })
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || `Passenger sign-up failed: ${res.status}`);

    passengerAuthSession = { token: payload.token, user: payload.user };
    writePassengerAuthStorage(passengerAuthSession);
    passengerAuthNotice = { message: 'Your Enrich account is ready for this journey.', type: 'success' };
    renderPassengerAuthUi();
    showToast('Enrich account created', 'success');
  } catch (error) {
    console.error('Passenger sign-up failed:', error);
    setPassengerAuthNotice(error.message || 'Unable to create the Enrich account right now.', 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function signOutPassenger() {
  passengerAuthSession = null;
  clearPassengerAuthStorage();
  passengerAuthMode = 'signin';
  passengerAuthNotice = { message: 'Signed out. Entertainment stays available in guest mode.', type: 'info' };
  renderPassengerAuthUi();
  showToast('Signed out of Enrich', 'info');
}

function viewPassengerBenefits() {
  if (!passengerAuthSession || !passengerAuthSession.user) return;
  navigateTo('enrichauth');
  const tier = passengerAuthSession.user.tier || 'Enrich Explorer';
  showToast(`Enrich ${tier} benefits linked for this journey`, 'success');
}

document.addEventListener('DOMContentLoaded', () => {
  defaultPassengerDisplayName = document.querySelector('#screen-home .passenger-name')?.textContent.trim() || defaultPassengerDisplayName;
  renderPassengerAuthUi();
  restorePassengerAuthSession();
});
