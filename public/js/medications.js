/* ============================================================
   medications.js  —  Gestión de medicamentos y recordatorios
   ============================================================ */

async function renderMedications(container) {
  container.innerHTML = `<div class="page-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;
  await loadMedications(container);
}

async function loadMedications(container) {
  try {
    const [meds, todayMeds] = await Promise.all([
      API.getMedications(),
      API.getTodayMedications(),
    ]);
    buildMedicationsPage(container, meds, todayMeds);
  } catch (e) {
    Utils.toast(e.message, 'error');
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>${e.message}</h3></div>`;
  }
}

function buildMedicationsPage(container, meds, todayMeds) {
  const today = Utils.today();

  const todayHtml = todayMeds.length === 0
    ? `<div class="empty-state" style="padding:1rem"><div class="empty-state-icon" style="font-size:1.5rem">✅</div><p>Sin medicamentos para hoy</p></div>`
    : todayMeds.map(m => {
        const times = m.reminder_times || [];
        const logs  = m.today_logs || [];
        if (times.length === 0) {
          const log = logs[0];
          const status = log ? log.status : 'pending';
          return buildMedTodayRow(m, null, log, status);
        }
        return times.map(t => {
          const log = logs.find(l => l.scheduled_time && l.scheduled_time.startsWith(t));
          const status = log ? log.status : 'pending';
          return buildMedTodayRow(m, t, log, status);
        }).join('');
      }).join('');

  const medsListHtml = meds.length === 0
    ? `<div class="empty-state"><div class="empty-state-icon">💊</div><h3>Sin medicamentos</h3><p>Agrega tus medicamentos o suplementos.</p></div>`
    : `<div class="med-schedule">${meds.map(m => buildMedItem(m)).join('')}</div>`;

  container.innerHTML = `
    <h1 class="page-title">Medicamentos</h1>

    <!-- Today's schedule -->
    <div class="card mb-2">
      <div class="card-header">
        <span class="card-title">📋 Hoy — ${Utils.formatDate(today,{weekday:'long',day:'numeric',month:'long'})}</span>
      </div>
      <div id="today-med-list">${todayHtml}</div>
    </div>

    <!-- All medications -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">💊 Mis medicamentos</span>
        <button class="btn btn-primary btn-sm" id="add-med-btn">
          <i class="fa-solid fa-plus"></i> Agregar
        </button>
      </div>
      <div id="meds-list">${medsListHtml}</div>
    </div>
  `;

  // Add medication
  document.getElementById('add-med-btn').addEventListener('click', () => showMedModal(null, () => loadMedications(container)));

  // Edit / delete / toggle active
  container.querySelectorAll('.med-edit-btn').forEach(btn => {
    const medId = parseInt(btn.dataset.id);
    const med   = meds.find(m => m.id === medId);
    btn.addEventListener('click', () => showMedModal(med, () => loadMedications(container)));
  });
  container.querySelectorAll('.med-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      Utils.confirm('¿Eliminar este medicamento y su historial?', async () => {
        try {
          await API.deleteMedication(parseInt(btn.dataset.id));
          Utils.toast('Medicamento eliminado', 'success');
          loadMedications(container);
        } catch (e) { Utils.toast(e.message, 'error'); }
      });
    });
  });
  container.querySelectorAll('.med-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const active = btn.dataset.active === 'true';
      try {
        await API.updateMedication(id, { active: !active });
        Utils.toast(active ? 'Medicamento desactivado' : 'Medicamento activado', 'info');
        loadMedications(container);
      } catch (e) { Utils.toast(e.message, 'error'); }
    });
  });

  // Today med status buttons
  bindTodayMedButtons(container);
}

function buildMedTodayRow(m, time, log, status) {
  return `
    <div class="med-today-item">
      <div class="med-dot" style="background:${m.color}"></div>
      <div class="med-info">
        <div class="med-name">${m.name}</div>
        <div class="med-time">${m.dose || ''} ${time ? '· ' + time : ''}</div>
      </div>
      <button class="med-status-btn status-${status}"
        data-med="${m.id}" data-log="${log?.log_id||''}" data-time="${time||''}" data-status="${status}">
        ${status === 'taken' ? '✓ Tomado' : status === 'skipped' ? '✗ Omitido' : 'Marcar tomado'}
      </button>
      ${status === 'pending' ? `<button class="btn btn-ghost btn-sm med-skip-btn" data-med="${m.id}" data-log="${log?.log_id||''}" data-time="${time||''}">Omitir</button>` : ''}
    </div>`;
}

function buildMedItem(m) {
  const timesHtml = (m.reminder_times || []).length > 0
    ? `<div class="time-list">${m.reminder_times.map(t =>
        `<span class="time-chip"><i class="fa-regular fa-clock"></i> ${t}</span>`).join('')}</div>`
    : '<span class="text-muted" style="font-size:.8rem">Sin recordatorio de hora</span>';

  return `
    <div class="med-item ${m.active ? '' : 'opacity-60'}" style="${m.active ? '' : 'opacity:.6'}">
      <div class="med-color-circle" style="background:${m.color}"></div>
      <div class="med-info-main">
        <div class="med-item-name">${m.name} ${!m.active ? '<span style="font-size:.75rem;color:var(--text-muted)">(inactivo)</span>' : ''}</div>
        <div class="med-item-dose">${m.dose || ''} · ${Utils.frequencyLabel(m.frequency)}</div>
        ${timesHtml}
        ${m.notes ? `<p class="text-muted" style="font-size:.8rem;margin-top:.25rem">${m.notes}</p>` : ''}
      </div>
      <div class="med-actions">
        <button class="btn btn-icon btn-ghost med-toggle-btn" data-id="${m.id}" data-active="${m.active}" title="${m.active?'Desactivar':'Activar'}">
          <i class="fa-solid fa-${m.active?'pause':'play'}"></i>
        </button>
        <button class="btn btn-icon btn-ghost med-edit-btn" data-id="${m.id}" title="Editar">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn btn-icon btn-danger med-delete-btn" data-id="${m.id}" title="Eliminar">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>`;
}

function bindTodayMedButtons(container) {
  const today = Utils.today();

  container.querySelectorAll('.med-status-btn[data-status="pending"]').forEach(btn => {
    btn.addEventListener('click', async () => markMedStatus(btn, today, 'taken'));
  });
  container.querySelectorAll('.med-skip-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fakeBtnWrapper = btn.previousElementSibling;
      if (fakeBtnWrapper && fakeBtnWrapper.dataset.med) {
        await markMedStatus(fakeBtnWrapper, today, 'skipped');
        btn.remove();
      }
    });
  });
}

async function markMedStatus(btn, today, status) {
  const medId = parseInt(btn.dataset.med);
  const logId = btn.dataset.log ? parseInt(btn.dataset.log) : null;
  const time  = btn.dataset.time || null;
  try {
    if (logId) {
      await API.updateMedLog(logId, { status });
    } else {
      await API.logMedication({ medication_id: medId, scheduled_date: today, scheduled_time: time || null, status });
    }
    btn.className = `med-status-btn status-${status}`;
    btn.textContent = status === 'taken' ? '✓ Tomado' : '✗ Omitido';
    btn.dataset.status = status;
    btn.disabled = true;
    Utils.toast(status === 'taken' ? 'Medicamento marcado como tomado ✓' : 'Medicamento omitido', status === 'taken' ? 'success' : 'info');
    // Update global badge
    const pending = document.querySelectorAll('.med-status-btn[data-status="pending"]').length;
    const badge   = document.getElementById('med-badge');
    if (badge) { if (pending === 0) badge.classList.add('hidden'); else { badge.textContent = pending; badge.classList.remove('hidden'); } }
  } catch (e) {
    Utils.toast(e.message, 'error');
  }
}

function showMedModal(existing, onSave) {
  const times = existing?.reminder_times || [];

  Utils.modal.open(
    existing ? '✏️ Editar medicamento' : '➕ Nuevo medicamento',
    `<div class="form-group">
       <label class="form-label">Nombre *</label>
       <input type="text" id="med-name" class="form-input" value="${existing?.name||''}" placeholder="Ibuprofeno, Ácido fólico..." />
     </div>
     <div class="form-row">
       <div class="form-group">
         <label class="form-label">Dosis</label>
         <input type="text" id="med-dose" class="form-input" value="${existing?.dose||''}" placeholder="200mg, 1 pastilla..." />
       </div>
       <div class="form-group">
         <label class="form-label">Frecuencia</label>
         <select id="med-freq" class="form-input">
           ${[['daily','Diario'],['weekly','Semanal'],['monthly','Mensual'],['as_needed','Cuando sea necesario'],['cycle_only','Solo durante el ciclo']].map(([v,l]) =>
             `<option value="${v}" ${existing?.frequency===v?'selected':''}>${l}</option>`).join('')}
         </select>
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">Horarios de recordatorio</label>
       <div style="display:flex;gap:.5rem;align-items:center">
         <input type="time" id="med-time-input" class="form-input" style="max-width:130px" />
         <button class="btn btn-secondary btn-sm" id="add-time-btn">+ Agregar</button>
       </div>
       <div class="time-list mt-1" id="times-list">
         ${times.map(t => `<span class="time-chip">${t} <span class="time-chip-remove" data-time="${t}">✕</span></span>`).join('')}
       </div>
     </div>
     <div class="form-row">
       <div class="form-group">
         <label class="form-label">Color</label>
         <input type="color" id="med-color" class="form-input" style="height:40px;padding:.2rem" value="${existing?.color||'#C2185B'}" />
       </div>
       <div class="form-group">
         <label class="form-label">Estado</label>
         <select id="med-active" class="form-input">
           <option value="true"  ${existing?.active!==false?'selected':''}>Activo</option>
           <option value="false" ${existing?.active===false?'selected':''}>Inactivo</option>
         </select>
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">Notas</label>
       <textarea id="med-notes" class="form-input" rows="2" placeholder="Tomar con comida...">${existing?.notes||''}</textarea>
     </div>`,
    `<button class="btn btn-ghost" onclick="Utils.modal.close()">Cancelar</button>
     <button class="btn btn-primary" id="med-save-btn">Guardar</button>`
  );

  let selectedTimes = [...times];

  function renderTimes() {
    document.getElementById('times-list').innerHTML = selectedTimes.map(t =>
      `<span class="time-chip">${t} <span class="time-chip-remove" data-time="${t}" style="cursor:pointer">✕</span></span>`
    ).join('');
    document.querySelectorAll('.time-chip-remove').forEach(span => {
      span.addEventListener('click', () => {
        selectedTimes = selectedTimes.filter(x => x !== span.dataset.time);
        renderTimes();
      });
    });
  }
  renderTimes();

  document.getElementById('add-time-btn').addEventListener('click', () => {
    const t = document.getElementById('med-time-input').value;
    if (t && !selectedTimes.includes(t)) {
      selectedTimes.push(t);
      selectedTimes.sort();
      renderTimes();
    }
  });

  document.getElementById('med-save-btn').addEventListener('click', async () => {
    const name  = document.getElementById('med-name').value.trim();
    if (!name) { Utils.toast('El nombre es requerido', 'warning'); return; }
    const data = {
      name,
      dose:           document.getElementById('med-dose').value.trim() || undefined,
      frequency:      document.getElementById('med-freq').value,
      reminder_times: selectedTimes,
      color:          document.getElementById('med-color').value,
      active:         document.getElementById('med-active').value === 'true',
      notes:          document.getElementById('med-notes').value.trim() || undefined,
    };
    const btn = document.getElementById('med-save-btn');
    Utils.btnLoading(btn, true);
    try {
      if (existing) await API.updateMedication(existing.id, data);
      else          await API.addMedication(data);
      Utils.modal.close();
      Utils.toast(existing ? 'Medicamento actualizado ✓' : 'Medicamento agregado ✓', 'success');
      onSave();
    } catch (e) {
      Utils.toast(e.message, 'error');
      Utils.btnLoading(btn, false);
    }
  });
}

window.renderMedications = renderMedications;
