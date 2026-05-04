/* ============================================================
   app.js  -  Enrutador principal SPA + manejo de auth
   ============================================================ */

(function () {
  'use strict';

  const PAGES = {
    dashboard:   { render: () => window.renderDashboard,   title: 'Inicio' },
    calendar:    { render: () => window.renderCalendar,    title: 'Calendario' },
    log:         { render: () => window.renderLog,         title: 'Registrar hoy' },
    medications: { render: () => window.renderMedications, title: 'Medicamentos' },
    stats:       { render: () => window.renderStats,       title: 'Estadisticas' },
    notes:       { render: () => window.renderNotes,       title: 'Diario' },
    profile:     { render: () => window.renderProfile,     title: 'Mi perfil' },
    ai:          { render: () => window.renderAI,          title: 'Analisis IA' },
  };

  let _currentPage = null;
  let _currentUser = null;

  window.App = {
    navigate(page, param) { navigateTo(page, param); },
    showAuth()            { showAuth(); },
    showApp(user)         { showApp(user); },
    showOnboarding()      { showOnboarding(); },
    logout()              { doLogout(); },
    get currentUser()     { return _currentUser; },
  };

  document.addEventListener('DOMContentLoaded', () => {
    _registerAuthHandlers();
    _registerOnboardingHandlers();
    _registerGlobalUI();

    const token = localStorage.getItem('luna_token');
    const user  = _parseStoredUser();

    if (token && user) {
      _currentUser = user;
      showApp(user);
    } else {
      showAuth();
    }
  });

  /* ---- Screens ---- */
  function showAuth() {
    _show('auth-screen');
    _hide('app');
    _hide('onboarding-screen');
    _switchAuthTab('login');
  }

  function showApp(user) {
    _currentUser = user;
    _hide('auth-screen');
    _hide('onboarding-screen');
    _show('app');
    const usernameEl = _el('header-username');
    const avatarEl   = _el('header-avatar');
    if (usernameEl) usernameEl.textContent = user.username || '';
    if (avatarEl)   avatarEl.textContent   = (user.username || 'U')[0].toUpperCase();
    navigateTo(sessionStorage.getItem('luna_last_page') || 'dashboard');
  }

  function showOnboarding() {
    _hide('auth-screen');
    _hide('app');
    _show('onboarding-screen');
    _goObStep(1);
  }

  /* ---- Navigation ---- */
  function navigateTo(page, param) {
    if (!PAGES[page]) page = 'dashboard';
    _currentPage = page;
    sessionStorage.setItem('luna_last_page', page);

    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    const titleEl = _el('header-title');
    if (titleEl) titleEl.textContent = PAGES[page].title;

    if (window.innerWidth < 768) _closeSidebar();

    const container = _el('app-content');
    if (!container) return;
    container.scrollTop = 0;

    const renderFn = PAGES[page].render();
    if (typeof renderFn === 'function') {
      renderFn(container, param);
    } else {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🚧</div><h3>Modulo no disponible</h3></div>';
    }
  }

  /* ---- Auth handlers ---- */
  function _registerAuthHandlers() {
    _el('go-register')?.addEventListener('click', (e) => { e.preventDefault(); _switchAuthTab('register'); });
    _el('go-login')?.addEventListener('click',    (e) => { e.preventDefault(); _switchAuthTab('login'); });

    _el('login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = _el('login-username')?.value.trim() || '';
      const password = _el('login-password')?.value || '';
      const errEl    = _el('login-error');
      if (!username || !password) { _setError(errEl, 'Ingresa usuario y contrasena.'); return; }
      _setError(errEl, '');
      const btn = _el('login-btn');
      _btnLoad(btn, 'Ingresando...');
      try {
        const res = await API.login(username, password);
        _storeAuth(res.token, res.user);
        if (!res.user.onboarding_completed) { showOnboarding(); }
        else { showApp(res.user); }
      } catch (err) { _setError(errEl, err.message); }
      finally { _btnLoad(btn, null); }
    });

    _el('register-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = _el('reg-username')?.value.trim()  || '';
      const password = _el('reg-password')?.value         || '';
      const confirm  = _el('reg-password2')?.value        || '';
      const errEl    = _el('register-error');
      if (!username)           { _setError(errEl, 'Elige un nombre de usuario.'); return; }
      if (password.length < 6) { _setError(errEl, 'La contrasena debe tener al menos 6 caracteres.'); return; }
      if (password !== confirm) { _setError(errEl, 'Las contrasenas no coinciden.'); return; }
      _setError(errEl, '');
      const btn = _el('register-btn');
      _btnLoad(btn, 'Creando cuenta...');
      try {
        const res = await API.register(username, password);
        _storeAuth(res.token, res.user);
        showOnboarding();
      } catch (err) { _setError(errEl, err.message); }
      finally { _btnLoad(btn, null); }
    });

    document.querySelectorAll('.pass-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = _el(btn.dataset.target);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        const icon = btn.querySelector('i');
        if (icon) icon.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      });
    });
  }

  /* ---- Onboarding ---- */
  let _obData = {};

  function _registerOnboardingHandlers() {
    document.addEventListener('click', (e) => {
      const obOpt = e.target.closest('.ob-opt');
      if (obOpt) {
        const group = obOpt.closest('.ob-options');
        if (group) group.querySelectorAll('.ob-opt').forEach(b => b.classList.remove('selected'));
        obOpt.classList.add('selected');
        if (group && group.id === 'ob-cycle-options') {
          const ci = _el('ob-cycle-custom');
          if (ci) ci.value = obOpt.dataset.value;
        }
        return;
      }
      const nextBtn = e.target.closest('.ob-next');
      if (nextBtn) {
        const nextTarget  = nextBtn.dataset.next;
        const currentStep = parseInt((nextBtn.closest('.ob-step') || {}).dataset && nextBtn.closest('.ob-step').dataset.step || '0');
        _collectObStep(currentStep);
        if (nextTarget === 'finish') { _finishOnboarding(); }
        else { _goObStep(parseInt(nextTarget)); }
      }
    });
  }

  function _goObStep(step) {
    document.querySelectorAll('.ob-step').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.step) === step);
    });
    const bar = _el('ob-prog-bar');
    if (bar) bar.style.width = (step / 4 * 100) + '%';
  }

  function _collectObStep(step) {
    if (step === 2) { const v = _el('ob-last-period') && _el('ob-last-period').value; if (v) _obData.last_period_start = v; }
    if (step === 3) {
      const custom   = _el('ob-cycle-custom') && _el('ob-cycle-custom').value;
      const selected = document.querySelector('#ob-cycle-options .ob-opt.selected');
      const val      = custom || (selected && selected.dataset.value);
      if (val) _obData.average_cycle_length = parseInt(val);
    }
    if (step === 4) {
      const selected = document.querySelector('#ob-period-options .ob-opt.selected');
      if (selected) _obData.average_period_length = parseInt(selected.dataset.value);
    }
  }

  async function _finishOnboarding() {
    try {
      await API.updateProfile(Object.assign({}, _obData, { onboarding_completed: true }));
      const stored = _parseStoredUser();
      if (stored) {
        const updated = Object.assign({}, stored, _obData, { onboarding_completed: true });
        localStorage.setItem('luna_user', JSON.stringify(updated));
        _currentUser = updated;
      }
    } catch (e) { console.error('Onboarding error:', e.message); }
    showApp(_currentUser || _parseStoredUser());
  }

  /* ---- Global UI ---- */
  function _registerGlobalUI() {
    document.addEventListener('click', (e) => {
      const navItem = e.target.closest('.nav-item[data-page]');
      if (navItem) { e.preventDefault(); navigateTo(navItem.dataset.page); return; }
      if (e.target.closest('#hamburger-btn'))  { _toggleSidebar(); return; }
      if (e.target.closest('#sidebar-close'))  { _closeSidebar(); return; }
      if (e.target.closest('#logout-btn'))     { doLogout(); return; }
      if (e.target.closest('[data-modal-close]') || e.target.closest('#modal-close') || e.target.id === 'modal-overlay') {
        if (Utils && Utils.modal) Utils.modal.close();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (Utils && Utils.modal) Utils.modal.close();
        _closeSidebar();
      }
    });
  }

  function _toggleSidebar() { var s = _el('sidebar'); if (s) s.classList.toggle('open'); }
  function _closeSidebar()  { var s = _el('sidebar'); if (s) s.classList.remove('open'); }

  /* ---- Auth helpers ---- */
  function _switchAuthTab(tab) {
    var lp = _el('login-panel');
    var rp = _el('register-panel');
    if (lp) lp.classList.toggle('hidden', tab !== 'login');
    if (rp) rp.classList.toggle('hidden', tab !== 'register');
  }

  function _storeAuth(token, user) {
    localStorage.setItem('luna_token', token);
    localStorage.setItem('luna_user',  JSON.stringify(user));
    _currentUser = user;
  }

  function _parseStoredUser() {
    try { return JSON.parse(localStorage.getItem('luna_user') || 'null'); }
    catch (e) { return null; }
  }

  function doLogout() {
    if (typeof Utils !== 'undefined' && Utils.confirm) {
      Utils.confirm('Cerrar sesion?').then(function(ok) { if (ok) _clearSession(); });
    } else {
      if (confirm('Cerrar sesion?')) _clearSession();
    }
  }

  function _clearSession() {
    localStorage.removeItem('luna_token');
    localStorage.removeItem('luna_user');
    sessionStorage.removeItem('luna_last_page');
    _currentUser = null;
    showAuth();
    if (Utils && Utils.toast) Utils.toast('Sesion cerrada', 'info');
  }

  /* ---- DOM helpers ---- */
  function _el(id) { return document.getElementById(id); }
  function _show(id) { var el = _el(id); if (el) el.classList.remove('hidden'); }
  function _hide(id) { var el = _el(id); if (el) el.classList.add('hidden'); }
  function _setError(el, msg) { if (el) { el.textContent = msg; el.classList.toggle('hidden', !msg); } }

  function _btnLoad(btn, loadingText) {
    if (!btn) return;
    var textEl = btn.querySelector('.btn-text');
    var spinEl = btn.querySelector('.btn-spinner');
    if (loadingText) {
      btn.disabled = true;
      if (textEl) textEl.textContent = loadingText;
      if (spinEl) spinEl.classList.remove('hidden');
    } else {
      btn.disabled = false;
      if (spinEl) spinEl.classList.add('hidden');
    }
  }

})();
