/* ============================================================
   profile.js  —  Perfil y configuración
   ============================================================ */

async function renderProfile(container) {
  container.innerHTML = `<div class="page-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;
  try {
    const user = await API.getMe();
    buildProfilePage(container, user);
  } catch (e) {
    Utils.toast(e.message, 'error');
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>${e.message}</h3></div>`;
  }
}

function buildProfilePage(container, user) {
  const initial = (user.username || 'U')[0].toUpperCase();

  container.innerHTML = `
    <h1 class="page-title">Mi perfil</h1>

    <!-- Avatar + username -->
    <div class="profile-header card mb-2">
      <div class="profile-avatar">${initial}</div>
      <div>
        <div class="profile-username">${Utils.escHtml(user.username)}</div>
        <div class="profile-since">Miembro desde ${Utils.formatDate(user.created_at, {month:'long', year:'numeric'})}</div>
      </div>
    </div>

    <!-- Cycle settings -->
    <div class="card mb-2">
      <div class="card-header"><span class="card-title">🌙 Configuración del ciclo</span></div>
      <form id="profile-cycle-form" novalidate>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Duración promedio del ciclo (días)</label>
            <input class="form-input" id="avg-cycle" type="number" min="15" max="60"
              value="${user.average_cycle_length || 28}">
          </div>
          <div class="form-group">
            <label class="form-label">Duración promedio del período (días)</label>
            <input class="form-input" id="avg-period" type="number" min="1" max="15"
              value="${user.average_period_length || 5}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Inicio del último período</label>
          <input class="form-input" id="last-period" type="date"
            value="${user.last_period_start ? user.last_period_start.split('T')[0] : ''}"
            max="${Utils.today()}">
        </div>
        <div id="profile-cycle-error" class="field-error"></div>
        <div style="margin-top:.75rem">
          <button type="submit" class="btn btn-primary" id="save-cycle-btn">
            <i class="fa-solid fa-floppy-disk"></i> Guardar cambios
          </button>
        </div>
      </form>
    </div>

    <!-- Change password -->
    <div class="card mb-2">
      <div class="card-header"><span class="card-title">🔒 Cambiar contraseña</span></div>
      <form id="profile-pw-form" novalidate>
        <div class="form-group">
          <label class="form-label">Contraseña actual</label>
          <div class="input-with-icon">
            <input class="form-input" id="pw-current" type="password" placeholder="Tu contraseña actual" autocomplete="current-password">
            <button type="button" class="input-eye-btn" data-target="pw-current"><i class="fa-regular fa-eye"></i></button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Nueva contraseña</label>
          <div class="input-with-icon">
            <input class="form-input" id="pw-new" type="password" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
            <button type="button" class="input-eye-btn" data-target="pw-new"><i class="fa-regular fa-eye"></i></button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar nueva contraseña</label>
          <div class="input-with-icon">
            <input class="form-input" id="pw-confirm" type="password" placeholder="Repite la nueva contraseña" autocomplete="new-password">
            <button type="button" class="input-eye-btn" data-target="pw-confirm"><i class="fa-regular fa-eye"></i></button>
          </div>
        </div>
        <div id="profile-pw-error" class="field-error"></div>
        <div style="margin-top:.75rem">
          <button type="submit" class="btn btn-primary" id="save-pw-btn">
            <i class="fa-solid fa-lock"></i> Cambiar contraseña
          </button>
        </div>
      </form>
    </div>

    <!-- Data export + danger -->
    <div class="card">
      <div class="card-header"><span class="card-title">⚙️ Datos y cuenta</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:.75rem">
        <button class="btn btn-ghost" id="export-profile-btn">
          <i class="fa-solid fa-download"></i> Exportar mis datos
        </button>
        <button class="btn btn-danger-outline" id="logout-btn-profile">
          <i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión
        </button>
      </div>
    </div>
  `;

  // ── Cycle settings save ────────────────────────────────────
  document.getElementById('profile-cycle-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const avgCycle   = parseInt(document.getElementById('avg-cycle').value);
    const avgPeriod  = parseInt(document.getElementById('avg-period').value);
    const lastPeriod = document.getElementById('last-period').value;
    const errEl      = document.getElementById('profile-cycle-error');
    errEl.textContent = '';

    if (avgCycle < 15 || avgCycle > 60) { errEl.textContent = 'Ciclo entre 15 y 60 días.'; return; }
    if (avgPeriod < 1 || avgPeriod > 15) { errEl.textContent = 'Período entre 1 y 15 días.'; return; }

    const btn = document.getElementById('save-cycle-btn');
    Utils.btnLoading(btn, true, 'Guardando…');
    try {
      await API.updateProfile({
        average_cycle_length:  avgCycle,
        average_period_length: avgPeriod,
        last_period_start:     lastPeriod || null,
      });
      // Update stored user
      const stored = JSON.parse(localStorage.getItem('luna_user') || '{}');
      localStorage.setItem('luna_user', JSON.stringify({
        ...stored,
        average_cycle_length:  avgCycle,
        average_period_length: avgPeriod,
        last_period_start:     lastPeriod || null,
      }));
      Utils.toast('Perfil actualizado ✓', 'success');
    } catch (err) { errEl.textContent = err.message; }
    finally { Utils.btnLoading(btn, false, '<i class="fa-solid fa-floppy-disk"></i> Guardar cambios'); }
  });

  // ── Password change ────────────────────────────────────────
  document.getElementById('profile-pw-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const current  = document.getElementById('pw-current').value;
    const newPw    = document.getElementById('pw-new').value;
    const confirm  = document.getElementById('pw-confirm').value;
    const errEl    = document.getElementById('profile-pw-error');
    errEl.textContent = '';

    if (!current)         { errEl.textContent = 'Ingresa tu contraseña actual.'; return; }
    if (newPw.length < 6) { errEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; return; }
    if (newPw !== confirm) { errEl.textContent = 'Las contraseñas no coinciden.'; return; }

    const btn = document.getElementById('save-pw-btn');
    Utils.btnLoading(btn, true, 'Cambiando…');
    try {
      await API.changePassword({ current_password: current, new_password: newPw });
      Utils.toast('Contraseña actualizada ✓', 'success');
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value     = '';
      document.getElementById('pw-confirm').value = '';
    } catch (err) { errEl.textContent = err.message; }
    finally { Utils.btnLoading(btn, false, '<i class="fa-solid fa-lock"></i> Cambiar contraseña'); }
  });

  // ── Export ─────────────────────────────────────────────────
  document.getElementById('export-profile-btn')?.addEventListener('click', async () => {
    try {
      const data = await API.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `luna-mis-datos-${Utils.today()}.json`; a.click();
      URL.revokeObjectURL(url);
      Utils.toast('Datos exportados ✓', 'success');
    } catch (err) { Utils.toast(err.message, 'error'); }
  });

  // ── Logout shortcut ────────────────────────────────────────
  document.getElementById('logout-btn-profile')?.addEventListener('click', () => {
    window.App?.logout();
  });

  // ── Password toggles ───────────────────────────────────────
  container.querySelectorAll('.input-eye-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    });
  });
}

window.renderProfile = renderProfile;
