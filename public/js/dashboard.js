/* ============================================================
   dashboard.js  —  Página de inicio / resumen
   ============================================================ */

async function renderDashboard(container) {
  container.innerHTML = `<div class="page-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;

  let summary, todayMeds, recentSymptoms, recentMoods;
  try {
    [summary, todayMeds, recentSymptoms, recentMoods] = await Promise.all([
      API.getSummary(),
      API.getTodayMedications(),
      API.getSymptoms({ start: Utils.addDays(Utils.today(), -7), end: Utils.today() }),
      API.getMoods({ start: Utils.addDays(Utils.today(), -7),    end: Utils.today() }),
    ]);
  } catch (e) {
    Utils.toast(e.message, 'error');
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>${e.message}</h3></div>`;
    return;
  }

  const pred   = summary.predictions;
  const today  = Utils.today();
  const user   = JSON.parse(localStorage.getItem('luna_user') || '{}');

  // ── Welcome banner ────────────────────────────────────────
  let welcomeMsg = '¡Hola! Registra tu ciclo para comenzar.';
  let phaseHtml  = '';
  let welcomeEmoji = '🌙';

  if (pred) {
    const phase = Utils.phaseInfo(pred.phase);
    welcomeMsg  = `${pred.daysUntilPeriod > 0 ? `Tu próximo período es en ${pred.daysUntilPeriod} días` : pred.daysUntilPeriod === 0 ? '¡Tu período comienza hoy!' : 'Tu período comenzó hace ' + Math.abs(pred.daysUntilPeriod) + ' días'}.`;
    phaseHtml   = `<span class="phase-chip">${phase.emoji} ${phase.label}</span>`;
    welcomeEmoji = phase.emoji;
  }

  // ── KPI cards ─────────────────────────────────────────────
  const kpis = pred ? [
    { icon: '📅', value: pred.currentCycleDay, label: 'Día del ciclo', sub: `de ~${pred.avgCycleLen}`, color: 'var(--primary)' },
    { icon: '⏳', value: pred.daysUntilPeriod > 0 ? pred.daysUntilPeriod : '¡Hoy!', label: 'Días para período', sub: Utils.formatRelative(pred.nextPeriodStart), color: pred.daysUntilPeriod <= 3 ? 'var(--warning)' : 'var(--primary)' },
    { icon: '🌸', value: Utils.diffDays(pred.fertileEnd, today) >= 0 && Utils.diffDays(today, pred.fertileStart) >= 0 ? '¡Hoy!' : (Utils.diffDays(pred.fertileStart, today) > 0 ? Utils.diffDays(pred.fertileStart, today) + 'd' : '—'), label: 'Ventana fértil', sub: pred.fertileStart === pred.fertileEnd ? pred.fertileStart : `${pred.fertileStart} → ${pred.fertileEnd}`, color: 'var(--secondary)' },
    { icon: '📊', value: pred.avgCycleLen, label: 'Ciclo promedio', sub: `${pred.avgPeriodLen} días de período`, color: 'var(--info)' },
  ] : [
    { icon: '🌙', value: '—', label: 'Sin ciclos', sub: 'Registra tu primer período', color: 'var(--text-muted)' },
  ];

  const kpiHtml = kpis.map(k => `
    <div class="kpi-card" style="--kpi-color:${k.color}">
      <div class="kpi-icon">${k.icon}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');

  // ── Cycle ring ────────────────────────────────────────────
  let ringHtml = '';
  if (pred) {
    const pct  = Math.min((pred.currentCycleDay / pred.avgCycleLen) * 100, 100);
    const r    = 65;
    const circ = 2 * Math.PI * r;
    const dash = circ - (pct / 100) * circ;
    const phaseColor = Utils.phaseInfo(pred.phase).color;
    ringHtml = `
      <div class="cycle-ring-wrap">
        <div class="cycle-ring">
          <svg class="cycle-ring-svg" width="160" height="160" viewBox="0 0 160 160">
            <circle class="cycle-ring-bg" cx="80" cy="80" r="${r}" />
            <circle class="cycle-ring-fill" cx="80" cy="80" r="${r}"
              stroke="${phaseColor}"
              stroke-dasharray="${circ}"
              stroke-dashoffset="${dash}" />
          </svg>
          <div class="cycle-ring-center">
            <span class="ring-day-num">${pred.currentCycleDay}</span>
            <span class="ring-day-lbl">día</span>
          </div>
        </div>
        <p style="font-size:.85rem;color:var(--text-secondary);margin-top:.5rem">
          ${Utils.phaseInfo(pred.phase).tip}
        </p>
      </div>`;
  }

  // ── Today's medications ───────────────────────────────────
  let medHtml = '';
  if (todayMeds.length === 0) {
    medHtml = `<div class="empty-state" style="padding:1rem"><div class="empty-state-icon" style="font-size:1.5rem">💊</div><p>Sin medicamentos activos</p></div>`;
  } else {
    medHtml = `<div class="med-today-list">
      ${todayMeds.map(m => {
        const logs = m.today_logs || [];
        const times = m.reminder_times || [];
        if (times.length === 0) {
          const log = logs[0];
          const status = log ? log.status : 'pending';
          return `<div class="med-today-item">
            <div class="med-dot" style="background:${m.color}"></div>
            <div class="med-info">
              <div class="med-name">${m.name}</div>
              <div class="med-time">${m.dose || ''} · ${Utils.frequencyLabel(m.frequency)}</div>
            </div>
            <button class="med-status-btn status-${status}" data-med="${m.id}" data-log="${log?.log_id||''}" data-status="${status}">
              ${status === 'taken' ? '✓ Tomado' : status === 'skipped' ? 'Omitido' : 'Marcar'}
            </button>
          </div>`;
        }
        return times.map(t => {
          const log = logs.find(l => l.scheduled_time && l.scheduled_time.startsWith(t));
          const status = log ? log.status : 'pending';
          return `<div class="med-today-item">
            <div class="med-dot" style="background:${m.color}"></div>
            <div class="med-info">
              <div class="med-name">${m.name}</div>
              <div class="med-time">${m.dose || ''} · ${t}</div>
            </div>
            <button class="med-status-btn status-${status}" data-med="${m.id}" data-log="${log?.log_id||''}" data-time="${t}" data-status="${status}">
              ${status === 'taken' ? '✓ Tomado' : status === 'skipped' ? 'Omitido' : 'Marcar'}
            </button>
          </div>`;
        }).join('');
      }).join('')}
    </div>`;
  }

  // ── Recent symptoms ───────────────────────────────────────
  const latestSymptoms = [...new Map(recentSymptoms.map(s => [s.symptom_type, s])).values()].slice(0,6);
  const symptomChipsHtml = latestSymptoms.length > 0
    ? `<div style="display:flex;flex-wrap:wrap;gap:.5rem">${latestSymptoms.map(s =>
        `<span class="symptom-chip selected" style="cursor:default">${s.symptom_type} <span class="sev-badge">${s.severity}</span></span>`).join('')}</div>`
    : `<p class="text-muted">Ninguno registrado esta semana</p>`;

  // ── Pending medications count for badge ──────────────────
  const pendingMeds = todayMeds.reduce((acc, m) => {
    const times = m.reminder_times || [];
    const logs  = m.today_logs || [];
    if (times.length === 0) { if (!logs[0] || logs[0].status === 'pending') acc++; }
    else times.forEach(t => { const l = logs.find(lg => lg.scheduled_time && lg.scheduled_time.startsWith(t)); if (!l || l.status === 'pending') acc++; });
    return acc;
  }, 0);
  const badge = document.getElementById('med-badge');
  if (pendingMeds > 0) { badge.textContent = pendingMeds; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');

  // ── Render ────────────────────────────────────────────────
  container.innerHTML = `
    <h1 class="page-title">Inicio</h1>

    <div class="welcome-banner">
      <span class="welcome-emoji">${welcomeEmoji}</span>
      <div class="welcome-text">
        <h2>¡Hola, ${Utils.cap(user.username || 'usuaria')}!</h2>
        <p>${welcomeMsg}</p>
        ${phaseHtml}
      </div>
    </div>

    <div class="quick-log-strip">
      <button class="quick-btn" data-goto="log"><i class="fa-solid fa-pen-to-square"></i> Registrar hoy</button>
      <button class="quick-btn" id="quick-period"><i class="fa-solid fa-droplet"></i> Iniciar período</button>
      <button class="quick-btn" data-goto="calendar"><i class="fa-solid fa-calendar-days"></i> Ver calendario</button>
      <button class="quick-btn" data-goto="notes"><i class="fa-solid fa-book"></i> Nueva nota</button>
    </div>

    <div class="kpi-grid mb-2">${kpiHtml}</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Ciclo actual</span>
        </div>
        ${pred ? ringHtml : '<div class="empty-state"><div class="empty-state-icon" style="font-size:1.5rem">📅</div><p>Registra tu primer período para ver el progreso.</p></div>'}
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">💊 Medicamentos hoy</span>
          <a href="#medications" class="btn btn-sm btn-ghost" data-goto="medications">Ver todos</a>
        </div>
        ${medHtml}
      </div>
    </div>

    ${pred ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem">
      <div class="card">
        <div class="card-header"><span class="card-title">📆 Próximas fechas</span></div>
        <div style="display:flex;flex-direction:column;gap:.6rem">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:.875rem;color:var(--text-secondary)">🩸 Próximo período</span>
            <span style="font-weight:700;color:var(--primary)">${Utils.formatRelative(pred.nextPeriodStart)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:.875rem;color:var(--text-secondary)">⚡ Ovulación est.</span>
            <span style="font-weight:700;color:var(--secondary)">${Utils.formatRelative(pred.ovulationDay)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:.875rem;color:var(--text-secondary)">🌸 Ventana fértil</span>
            <span style="font-weight:700;color:var(--secondary-light)">${Utils.formatDate(pred.fertileStart,{day:'numeric',month:'short'})} – ${Utils.formatDate(pred.fertileEnd,{day:'numeric',month:'short'})}</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">😊 Síntomas recientes</span></div>
        ${symptomChipsHtml}
      </div>
    </div>` : ''}
  `;

  // ── Event listeners ───────────────────────────────────────
  // Navigation quick buttons
  container.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => window.App.navigate(btn.dataset.goto));
  });

  // Quick period start
  container.querySelector('#quick-period')?.addEventListener('click', () => showStartPeriodModal());

  // Med status buttons
  container.querySelectorAll('.med-status-btn').forEach(btn => {
    if (btn.dataset.status !== 'pending') return;
    btn.addEventListener('click', async () => {
      try {
        const medId = parseInt(btn.dataset.med);
        const logId = btn.dataset.log ? parseInt(btn.dataset.log) : null;
        const time  = btn.dataset.time || null;
        if (logId) {
          await API.updateMedLog(logId, { status: 'taken' });
        } else {
          await API.logMedication({ medication_id: medId, scheduled_date: today, scheduled_time: time, status: 'taken' });
        }
        btn.className = 'med-status-btn status-taken';
        btn.textContent = '✓ Tomado';
        btn.dataset.status = 'taken';
        btn.disabled = true;
        Utils.toast('Medicamento marcado como tomado ✓', 'success');
        // Update badge
        const pending = container.querySelectorAll('.med-status-btn[data-status="pending"]').length;
        if (pending === 0) badge.classList.add('hidden');
        else { badge.textContent = pending; badge.classList.remove('hidden'); }
      } catch (e) {
        Utils.toast(e.message, 'error');
      }
    });
  });
}

function showStartPeriodModal() {
  Utils.modal.open(
    '🩸 Iniciar nuevo período',
    `<div class="form-group">
       <label class="form-label">Fecha de inicio</label>
       <input type="date" id="sp-date" class="form-input" value="${Utils.today()}" max="${Utils.today()}" />
     </div>
     <div class="form-group">
       <label class="form-label">Intensidad del primer día</label>
       <div class="flow-selector" id="sp-flow">
         ${[['spotting','Manchado','·'],['light','Leve','💧'],['medium','Moderado','💧💧'],['heavy','Abundante','🩸'],['very_heavy','Muy abund.','🩸🩸']].map(([v,l,e]) =>
           `<button class="flow-btn${v==='medium'?' selected':''}" data-val="${v}"><span class="flow-icon">${e}</span>${l}</button>`).join('')}
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">Notas (opcional)</label>
       <textarea id="sp-notes" class="form-input" rows="2" placeholder="Cólicos, manchado previo..."></textarea>
     </div>`,
    `<button class="btn btn-ghost" onclick="Utils.modal.close()">Cancelar</button>
     <button class="btn btn-primary" id="sp-save">Guardar</button>`
  );

  // Flow selector
  document.querySelectorAll('#sp-flow .flow-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#sp-flow .flow-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
    });
  });

  document.getElementById('sp-save').addEventListener('click', async () => {
    const date  = document.getElementById('sp-date').value;
    const flow  = document.querySelector('#sp-flow .flow-btn.selected')?.dataset.val || 'medium';
    const notes = document.getElementById('sp-notes').value;
    if (!date) { Utils.toast('Selecciona una fecha', 'warning'); return; }

    const btn = document.getElementById('sp-save');
    Utils.btnLoading(btn, true);
    try {
      await API.startCycle({ start_date: date, notes });
      await API.logPeriodDay({ date, flow_intensity: flow });
      Utils.modal.close();
      Utils.toast('¡Período iniciado! 🩸', 'success');
      window.App.navigate('dashboard');
    } catch (e) {
      Utils.toast(e.message, 'error');
      Utils.btnLoading(btn, false);
    }
  });
}

window.renderDashboard = renderDashboard;
