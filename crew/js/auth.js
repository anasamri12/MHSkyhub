const CREW_AUTH_STORAGE_KEY = 'mhskyhub_crew_auth';

(function bootstrapCrewAuth() {
  let authReady = false;
  let session = null;

  function loadSession() {
    try {
      localStorage.removeItem(CREW_AUTH_STORAGE_KEY);
    } catch (error) {
      // Ignore storage issues and fall back to an in-memory session only.
    }
    return null;
  }

  function saveSession(nextSession) {
    session = nextSession;
    syncAuthUi();
  }

  function clearSession() {
    session = null;
    localStorage.removeItem(CREW_AUTH_STORAGE_KEY);
    syncAuthUi();
  }

  function getToken() {
    return session && session.token ? session.token : '';
  }

  function getUser() {
    return session && session.user ? session.user : null;
  }

  function isAuthenticated() {
    return Boolean(getToken());
  }

  function canBoot() {
    const user = getUser();
    return authReady && isAuthenticated() && user && user.role === 'crew';
  }

  function setError(message) {
    const errorEl = document.getElementById('crew-login-error');
    if (!errorEl) return;
    errorEl.textContent = message || '';
  }

  function syncAuthUi() {
    const overlay = document.getElementById('crew-auth-overlay');
    const button = document.getElementById('crew-auth-btn');
    const nameEl = document.querySelector('.crew-name');
    const roleEl = document.querySelector('.crew-role');
    const user = getUser();
    const locked = !canBoot();

    document.body.classList.toggle('auth-locked', locked);
    if (overlay) {
      overlay.classList.toggle('show', locked);
      overlay.setAttribute('aria-hidden', locked ? 'false' : 'true');
    }

    if (button) {
      button.style.display = canBoot() ? 'inline-flex' : 'none';
    }

    if (nameEl) {
      nameEl.textContent = user && user.username ? user.username : 'Crew Login';
    }

    if (roleEl) {
      roleEl.textContent = user && user.role === 'crew' ? 'Authenticated Crew Access' : 'Cabin Management System';
    }
  }

  function showLogin(message) {
    authReady = true;
    setError(message || '');
    syncAuthUi();
  }

  function hideLogin() {
    setError('');
    syncAuthUi();
  }

  async function authFetch(url, options) {
    const requestOptions = options ? { ...options } : {};
    const headers = new Headers(requestOptions.headers || {});
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    requestOptions.headers = headers;

    const response = await fetch(url, requestOptions);
    if (response.status === 401 || response.status === 403) {
      clearSession();
      if (typeof window.stopCrewSync === 'function') window.stopCrewSync();
      if (typeof window.stopCrewApp === 'function') window.stopCrewApp();
      authReady = true;
      showLogin('Your crew session expired. Please sign in again.');
      throw new Error(`Crew authentication failed: ${response.status}`);
    }
    return response;
  }

  async function handleLogin(event) {
    event.preventDefault();

    const usernameEl = document.getElementById('crew-login-username');
    const passwordEl = document.getElementById('crew-login-password');
    const submitBtn = document.getElementById('crew-login-submit');
    const username = usernameEl ? usernameEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';

    setError('');
    if (!username || !password) {
      setError('Enter your crew username and password.');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload && payload.error ? payload.error : 'Unable to sign in');
      }

      if (!payload.user || payload.user.role !== 'crew') {
        throw new Error('This account does not have crew access.');
      }

      saveSession({ token: payload.token, user: payload.user });
      authReady = true;
      hideLogin();
      if (typeof window.startCrewApp === 'function') window.startCrewApp();
      if (typeof window.startCrewSync === 'function') window.startCrewSync();
    } catch (error) {
      clearSession();
      authReady = true;
      showLogin(error.message || 'Unable to sign in');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function initializeAuth() {
    const loginForm = document.getElementById('crew-login-form');
    const usernameEl = document.getElementById('crew-login-username');
    const passwordEl = document.getElementById('crew-login-password');

    loadSession();

    if (loginForm && !loginForm.dataset.bound) {
      loginForm.addEventListener('submit', handleLogin);
      loginForm.dataset.bound = 'true';
    }

    clearSession();
    authReady = true;
    showLogin('');

    if (usernameEl) usernameEl.focus();
    if (passwordEl) passwordEl.value = '';
  }

  function logout() {
    clearSession();
    if (typeof window.stopCrewSync === 'function') window.stopCrewSync();
    if (typeof window.stopCrewApp === 'function') window.stopCrewApp();
    window.location.reload();
  }

  window.crewAuth = {
    canBoot,
    fetch: authFetch,
    getToken,
    getUser,
    isAuthenticated,
    logout,
    showLogin
  };

  document.addEventListener('DOMContentLoaded', initializeAuth);
})();
