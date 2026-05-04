/* ============================================================
   log.js  —  Registro diario (período, síntomas, ánimo, ovulación)
   ============================================================ */

let logDate      = Utils.today();
let logCatalog   = [];
let logSelectedSymptoms = {}; // { symptom_type: severity }
let logSelectedMood     = null;
let logEnergyLevel      = 3;
let logFlowSelected     = null;
let logOvulData         = { cervical_mucus: null, bbt: '', lh_test: null, libido: 3 };
let logFoodLogs         = [];   // food logs loaded from API for logDate
let logFoodItems        = [];   // items being composed in the new-food form
let logFoodMealType     = 'desayuno';

async function renderLog(container, preDate = null) {
  if (preDate) logDate = preDate;

  container.innerHTML = `<div class="page-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;

  try {
    const [catalog, existingData] = await Promise.all([
      API.getSymptomCatalog(),
      loadDayData(logDate),
    ]);
    logCatalog = catalog;
    buildLogPage(container, existingData);
  } catch (e) {
    Utils.toast(e.message, 'error');
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>${e.message}</h3></div>`;
  }
}

async function loadDayData(date) {
  const [periodDays, symptoms, moods, ovulation, foodLogs] = await Promise.all([
    API.getPeriodDays({ date }),
    API.getSymptoms({ date }),
    API.getMoods({ date }),
    API.getOvulation({ start: date, end: date }),
    API.getFoodLogs({ date }).catch(() => []),
  ]);
  return { periodDay: periodDays[0] || null, symptoms, mood: moods[0] || null, ovulation: ovulation[0] || null, foodLogs };
}

function buildLogPage(container, existing) {
  // Pre-load existing data
  logSelectedSymptoms = {};
  logSelectedMood     = null;
  logEnergyLevel      = 3;
  logFlowSelected     = null;
  logOvulData         = { cervical_mucus: null, bbt: '', lh_test: null, libido: 3 };

  if (existing.periodDay) {
    logFlowSelected = existing.periodDay.flow_intensity;
  }
  if (existing.symptoms) {
    existing.symptoms.forEach(s => { logSelectedSymptoms[s.symptom_type] = s.severity; });
  }
  if (existing.mood) {
    logSelectedMood = existing.mood.mood;
    logEnergyLevel  = existing.mood.energy_level || 3;
  }
  if (existing.ovulation) {
    logOvulData = {
      cervical_mucus: existing.ovulation.cervical_mucus || null,
      bbt:    existing.ovulation.bbt || '',
      lh_test: existing.ovulation.lh_test || null,
      libido:  existing.ovulation.libido || 3,
    };
  }
  logFoodLogs  = existing.foodLogs || [];
  logFoodItems = [];
  logFoodMealType = 'desayuno';

  const isToday = logDate === Utils.today();
  const symByCategory = {};
  logCatalog.forEach(s => {
    if (!symByCategory[s.category]) symByCategory[s.category] = [];
    symByCategory[s.category].push(s);
  });

  const catLabels = {
    dolor: '💢 Dolor', digestivo: '🫃 Digestivo', piel: '🌸 Piel',
    sueño: '😴 Sueño', energia: '⚡ Energía', apetito: '🍫 Apetito',
    sangrado: '🩸 Sangrado', otros: '🔷 Otros',
  };

  container.innerHTML = `
    <h1 class="page-title">Registrar día</h1>

    <!-- Date picker -->
    <div class="card mb-2">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <label class="form-label" style="margin:0;min-width:max-content">Fecha:</label>
        <input type="date" id="log-date-input" class="form-input" style="max-width:190px" value="${logDate}" max="${Utils.today()}" />
        ${isToday ? '<span class="phase-chip phase-menstrual" style="background:var(--primary-pale);color:var(--primary-dark);font-size:.8rem;padding:.25rem .7rem;border-radius:12px">Hoy</span>' : ''}
      </div>
    </div>

    <!-- Tabs -->
    <div class="log-tabs">
      <button class="log-tab active" data-tab="period">🩸 Período</button>
      <button class="log-tab" data-tab="symptoms">🤕 Síntomas</button>
      <button class="log-tab" data-tab="mood">😊 Ánimo</button>
      <button class="log-tab" data-tab="ovulation">🌸 Ovulación</button>
      <button class="log-tab" data-tab="food">🍽️ Alimentos</button>
    </div>

    <!-- Tab: Period -->
    <div class="tab-content" id="tab-period">
      <div class="card">
        <div class="form-group">
          <label class="form-label">¿Tuviste menstruación este día?</label>
          <div style="display:flex;gap:.75rem;margin-bottom:1rem">
            <button class="btn ${logFlowSelected ? 'btn-primary' : 'btn-ghost'}" id="period-yes-btn">Sí</button>
            <button class="btn ${!logFlowSelected ? 'btn-primary' : 'btn-ghost'}" id="period-no-btn">No</button>
          </div>
        </div>
        <div id="flow-section" class="${logFlowSelected ? '' : 'hidden'}">
          <div class="form-group">
            <label class="form-label">Intensidad del flujo</label>
            <div class="flow-selector" id="flow-selector">
              ${[['spotting','Manchado','·'],['light','Leve','💧'],['medium','Moderado','💧💧'],['heavy','Abundante','🩸'],['very_heavy','Muy abund.','🩸🩸']].map(([v,l,e]) =>
                `<button class="flow-btn${logFlowSelected===v?' selected':''}" data-val="${v}"><span class="flow-icon">${e}</span>${l}</button>`).join('')}
            </div>
          </div>
          <button class="btn btn-primary" id="save-period-btn">
            <i class="fa-solid fa-floppy-disk"></i> Guardar período
          </button>
        </div>
        <div id="period-saved-msg" class="${logFlowSelected ? '' : 'hidden'}" style="color:var(--success);font-size:.875rem;margin-top:.5rem">
          ✓ Día de período guardado (${logFlowSelected ? Utils.flowInfo(logFlowSelected).label : ''})
        </div>
      </div>
    </div>

    <!-- Tab: Symptoms -->
    <div class="tab-content hidden" id="tab-symptoms">
      <div class="card">
        <p class="text-muted mb-2">Toca un síntoma para seleccionarlo y ajusta la severidad.</p>
        ${Object.entries(symByCategory).map(([cat, syms]) => `
          <div class="mb-2">
            <div class="settings-section-title">${catLabels[cat] || cat}</div>
            <div class="symptom-grid">
              ${syms.map(s => `
                <div class="symptom-chip${logSelectedSymptoms[s.name] ? ' selected' : ''}" data-symptom="${s.name}">
                  ${s.icon || ''} ${s.name}
                  ${logSelectedSymptoms[s.name] ? `<span class="sev-badge">${logSelectedSymptoms[s.name]}</span>` : ''}
                </div>`).join('')}
            </div>
          </div>`).join('')}
        <div id="severity-panel" class="hidden" style="margin-top:1rem;padding:1rem;background:var(--bg-subtle);border-radius:var(--radius-sm)">
          <p style="font-weight:600;margin-bottom:.75rem">Severidad de: <span id="sev-symptom-name"></span></p>
          <div class="severity-row">
            <span style="font-size:.8rem;color:var(--text-muted)">Leve</span>
            <input type="range" id="sev-slider" min="1" max="5" value="3" />
            <span style="font-size:.8rem;color:var(--text-muted)">Severo</span>
          </div>
          <div class="severity-labels">
            ${[1,2,3,4,5].map(n => `<span>${n}</span>`).join('')}
          </div>
          <div style="display:flex;gap:.5rem;margin-top:.75rem">
            <button class="btn btn-primary btn-sm" id="sev-confirm">Confirmar</button>
            <button class="btn btn-ghost btn-sm" id="sev-cancel">Cancelar</button>
          </div>
        </div>
        <button class="btn btn-primary mt-2" id="save-symptoms-btn">
          <i class="fa-solid fa-floppy-disk"></i> Guardar síntomas
        </button>
      </div>
    </div>

    <!-- Tab: Mood -->
    <div class="tab-content hidden" id="tab-mood">
      <div class="card">
        <div class="form-group">
          <label class="form-label">¿Cómo te sentiste?</label>
          <div class="mood-grid">
            ${[
              ['muy_bien','😁','Muy bien'],['bien','😊','Bien'],['neutral','😐','Neutral'],
              ['mal','😔','Mal'],['muy_mal','😢','Muy mal'],['feliz','😄','Feliz'],
              ['ansiosa','😰','Ansiosa'],['irritable','😤','Irritable'],['triste','😞','Triste'],
              ['energica','⚡','Con energía'],['cansada','😩','Cansada'],['sensible','🥺','Sensible'],['romantica','💕','Romántica']
            ].map(([v,e,l]) =>
              `<button class="mood-btn${logSelectedMood===v?' selected':''}" data-mood="${v}">
                <span class="mood-emoji">${e}</span>${l}
               </button>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Nivel de energía</label>
          <div class="energy-stars" id="energy-stars">
            ${[1,2,3,4,5].map(n =>
              `<span class="energy-star${n<=logEnergyLevel?' active':''}" data-val="${n}">⚡</span>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notas (opcional)</label>
          <textarea id="mood-notes" class="form-input" rows="2" placeholder="¿Algo especial que quieras recordar?">${existing.mood?.notes||''}</textarea>
        </div>
        <button class="btn btn-primary" id="save-mood-btn">
          <i class="fa-solid fa-floppy-disk"></i> Guardar estado de ánimo
        </button>
      </div>
    </div>

    <!-- Tab: Ovulation -->
    <div class="tab-content hidden" id="tab-ovulation">
      <div class="card">
        <div class="form-group">
          <label class="form-label">Moco cervical</label>
          <div class="mucus-grid">
            ${[['seco','Seco'],['cremoso','Cremoso'],['acuoso','Acuoso'],['elastico','Elástico (clara de huevo)'],['sin_observacion','Sin observación']].map(([v,l]) =>
              `<button class="mucus-btn${logOvulData.cervical_mucus===v?' selected':''}" data-mucus="${v}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Temperatura basal (°C)</label>
          <input type="number" id="bbt-input" class="form-input" style="max-width:150px" step="0.01" min="35" max="42" placeholder="36.50" value="${logOvulData.bbt||''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Test de LH (ovulación)</label>
          <div class="lh-grid">
            ${[['negativo','Negativo ➖'],['positivo','Positivo ➕'],['pico','Pico 🌟']].map(([v,l]) =>
              `<button class="lh-btn${logOvulData.lh_test===v?' selected':''}" data-val="${v}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Libido</label>
          <div class="energy-stars" id="libido-stars">
            ${[1,2,3,4,5].map(n =>
              `<span class="energy-star${n<=(logOvulData.libido||3)?' active':''}" data-val="${n}" style="font-size:1.2rem">❤️</span>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notas</label>
          <textarea id="ovul-notes" class="form-input" rows="2" placeholder="Sensaciones, observaciones...">${existing.ovulation?.notes||''}</textarea>
        </div>
        <button class="btn btn-primary" id="save-ovulation-btn">
          <i class="fa-solid fa-floppy-disk"></i> Guardar datos de ovulación
        </button>
      </div>
    </div>

    <!-- Tab: Food -->
    <div class="tab-content hidden" id="tab-food">
      <div class="card">
        <!-- Form: add new entry -->
        <div class="form-group">
          <label class="form-label">Tipo de comida</label>
          <div class="btn-group" id="food-meal-group">
            ${[['desayuno','☀️ Desayuno'],['almuerzo','🥗 Almuerzo'],['cena','🌙 Cena'],['snack','🍎 Snack'],['otro','🍽️ Otro']].map(([v,l]) =>
              `<button class="btn btn-outline food-meal-btn${logFoodMealType===v?' active':''}" data-meal="${v}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Agrega un alimento</label>
          <div style="display:flex;gap:.5rem">
            <input id="food-item-input" class="form-input" type="text" placeholder="Ej. arroz con pollo, chocolate…" />
            <button class="btn btn-outline" id="food-item-add-btn"><i class="fa-solid fa-plus"></i></button>
          </div>
          <div id="food-items-chips" style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.6rem">${_renderFoodChips(logFoodItems)}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Notas (opcional)</label>
          <textarea id="food-notes" class="form-input" rows="2" placeholder="Ej. comí tarde, sin apetito…"></textarea>
        </div>
        <button class="btn btn-primary" id="save-food-btn">
          <i class="fa-solid fa-floppy-disk"></i> Guardar comida
        </button>
      </div>

      <!-- Existing food logs for the day -->
      <div id="food-logs-list" style="margin-top:1rem">${_renderFoodLogsList(logFoodLogs)}</div>
    </div>
  `;

  // ── Date change ───────────────────────────────────────────
  const dateInput = document.getElementById('log-date-input');
  dateInput.addEventListener('change', async () => {
    logDate = dateInput.value;
    const existingData = await loadDayData(logDate);
    buildLogPage(container, existingData);
  });

  // ── Tabs ──────────────────────────────────────────────────
  document.querySelectorAll('.log-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });

  // ── Period yes/no ─────────────────────────────────────────
  document.getElementById('period-yes-btn').addEventListener('click', () => {
    document.getElementById('flow-section').classList.remove('hidden');
    document.getElementById('period-saved-msg').classList.add('hidden');
    if (!logFlowSelected) logFlowSelected = 'medium';
    document.querySelectorAll('#flow-selector .flow-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.val === logFlowSelected);
    });
  });
  document.getElementById('period-no-btn').addEventListener('click', () => {
    document.getElementById('flow-section').classList.add('hidden');
    logFlowSelected = null;
  });

  // ── Flow selector ─────────────────────────────────────────
  document.querySelectorAll('#flow-selector .flow-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#flow-selector .flow-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      logFlowSelected = b.dataset.val;
    });
  });

  // ── Save period ───────────────────────────────────────────
  document.getElementById('save-period-btn')?.addEventListener('click', async () => {
    if (!logFlowSelected) { Utils.toast('Selecciona la intensidad', 'warning'); return; }
    const btn = document.getElementById('save-period-btn');
    Utils.btnLoading(btn, true);
    try {
      await API.logPeriodDay({ date: logDate, flow_intensity: logFlowSelected });
      Utils.toast('Período guardado ✓', 'success');
      const msg = document.getElementById('period-saved-msg');
      msg.innerHTML = `✓ Día de período guardado (${Utils.flowInfo(logFlowSelected).label})`;
      msg.classList.remove('hidden');
    } catch (e) { Utils.toast(e.message, 'error'); }
    Utils.btnLoading(btn, false);
  });

  // ── Symptoms ──────────────────────────────────────────────
  let pendingSymptom = null;
  document.querySelectorAll('.symptom-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      pendingSymptom = chip.dataset.symptom;
      const panel = document.getElementById('severity-panel');
      document.getElementById('sev-symptom-name').textContent = pendingSymptom;
      const existSev = logSelectedSymptoms[pendingSymptom] || 3;
      const slider   = document.getElementById('sev-slider');
      slider.value   = existSev;
      slider.style.setProperty('--pct', ((existSev-1)/4*100) + '%');
      panel.classList.remove('hidden');
    });
  });

  document.getElementById('sev-slider')?.addEventListener('input', (e) => {
    e.target.style.setProperty('--pct', ((e.target.value-1)/4*100) + '%');
  });

  document.getElementById('sev-confirm')?.addEventListener('click', () => {
    const sev   = parseInt(document.getElementById('sev-slider').value);
    const chip  = document.querySelector(`.symptom-chip[data-symptom="${pendingSymptom}"]`);
    if (chip) {
      logSelectedSymptoms[pendingSymptom] = sev;
      chip.classList.add('selected');
      let badge = chip.querySelector('.sev-badge');
      if (!badge) { badge = document.createElement('span'); badge.className = 'sev-badge'; chip.appendChild(badge); }
      badge.textContent = sev;
    }
    document.getElementById('severity-panel').classList.add('hidden');
    pendingSymptom = null;
  });

  document.getElementById('sev-cancel')?.addEventListener('click', () => {
    document.getElementById('severity-panel').classList.add('hidden');
    pendingSymptom = null;
  });

  document.getElementById('save-symptoms-btn')?.addEventListener('click', async () => {
    const entries = Object.entries(logSelectedSymptoms);
    if (entries.length === 0) { Utils.toast('Selecciona al menos un síntoma', 'warning'); return; }
    const btn = document.getElementById('save-symptoms-btn');
    Utils.btnLoading(btn, true);
    try {
      // Delete existing symptoms for this date first, then re-add
      const existing = await API.getSymptoms({ date: logDate });
      await Promise.all(existing.map(s => API.deleteSymptom(s.id)));
      await Promise.all(entries.map(([symptom_type, severity]) =>
        API.addSymptom({ date: logDate, symptom_type, severity })
      ));
      Utils.toast(`${entries.length} síntoma(s) guardado(s) ✓`, 'success');
    } catch (e) { Utils.toast(e.message, 'error'); }
    Utils.btnLoading(btn, false);
  });

  // ── Mood ──────────────────────────────────────────────────
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      logSelectedMood = btn.dataset.mood;
    });
  });

  document.querySelectorAll('#energy-stars .energy-star').forEach(star => {
    star.addEventListener('click', () => {
      logEnergyLevel = parseInt(star.dataset.val);
      document.querySelectorAll('#energy-stars .energy-star').forEach((s, i) => {
        s.classList.toggle('active', i < logEnergyLevel);
      });
    });
  });

  document.getElementById('save-mood-btn')?.addEventListener('click', async () => {
    if (!logSelectedMood) { Utils.toast('Selecciona un estado de ánimo', 'warning'); return; }
    const btn = document.getElementById('save-mood-btn');
    Utils.btnLoading(btn, true);
    try {
      await API.logMood({
        date: logDate,
        mood: logSelectedMood,
        energy_level: logEnergyLevel,
        notes: document.getElementById('mood-notes').value || null,
      });
      Utils.toast('Estado de ánimo guardado ✓', 'success');
    } catch (e) { Utils.toast(e.message, 'error'); }
    Utils.btnLoading(btn, false);
  });

  // ── Ovulation ─────────────────────────────────────────────
  document.querySelectorAll('.mucus-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mucus-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      logOvulData.cervical_mucus = btn.dataset.mucus;
    });
  });

  document.querySelectorAll('.lh-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lh-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      logOvulData.lh_test = btn.dataset.val;
    });
  });

  document.querySelectorAll('#libido-stars .energy-star').forEach(star => {
    star.addEventListener('click', () => {
      logOvulData.libido = parseInt(star.dataset.val);
      document.querySelectorAll('#libido-stars .energy-star').forEach((s, i) => {
        s.classList.toggle('active', i < logOvulData.libido);
      });
    });
  });

  document.getElementById('save-ovulation-btn')?.addEventListener('click', async () => {
    const btn  = document.getElementById('save-ovulation-btn');
    const bbt  = parseFloat(document.getElementById('bbt-input').value) || null;
    const notes = document.getElementById('ovul-notes').value || null;
    Utils.btnLoading(btn, true);
    try {
      await API.logOvulation({
        date: logDate,
        ...(logOvulData.cervical_mucus ? { cervical_mucus: logOvulData.cervical_mucus } : {}),
        ...(bbt ? { bbt } : {}),
        ...(logOvulData.lh_test ? { lh_test: logOvulData.lh_test } : {}),
        libido: logOvulData.libido,
        notes,
      });
      Utils.toast('Datos de ovulación guardados ✓', 'success');
    } catch (e) { Utils.toast(e.message, 'error'); }
    Utils.btnLoading(btn, false);
  });
  // ── Food ──────────────────────────────────────────────────
  document.getElementById('food-meal-group')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.food-meal-btn');
    if (!btn) return;
    document.querySelectorAll('.food-meal-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    logFoodMealType = btn.dataset.meal;
  });

  document.getElementById('food-item-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('food-item-input');
    const val   = (input?.value || '').trim();
    if (!val) return;
    if (!logFoodItems.includes(val)) logFoodItems.push(val);
    if (input) input.value = '';
    const chips = document.getElementById('food-items-chips');
    if (chips) chips.innerHTML = _renderFoodChips(logFoodItems);
  });

  document.getElementById('food-item-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('food-item-add-btn')?.click(); }
  });

  document.getElementById('food-items-chips')?.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-food]');
    if (!rm) return;
    const idx = parseInt(rm.dataset.removeFood);
    logFoodItems.splice(idx, 1);
    const chips = document.getElementById('food-items-chips');
    if (chips) chips.innerHTML = _renderFoodChips(logFoodItems);
  });

  document.getElementById('save-food-btn')?.addEventListener('click', async () => {
    if (logFoodItems.length === 0) { Utils.toast('Agrega al menos un alimento', 'warning'); return; }
    const btn = document.getElementById('save-food-btn');
    Utils.btnLoading(btn, true);
    try {
      await API.addFoodLog({
        date: logDate,
        meal_type: logFoodMealType,
        foods: logFoodItems,
        notes: document.getElementById('food-notes')?.value || null,
      });
      Utils.toast('Alimentos guardados ✓', 'success');
      logFoodItems = [];
      const chips = document.getElementById('food-items-chips');
      if (chips) chips.innerHTML = '';
      const notesEl = document.getElementById('food-notes');
      if (notesEl) notesEl.value = '';
      // Refresh list
      const newLogs = await API.getFoodLogs({ date: logDate }).catch(() => []);
      logFoodLogs = newLogs;
      const listEl = document.getElementById('food-logs-list');
      if (listEl) listEl.innerHTML = _renderFoodLogsList(logFoodLogs);
    } catch (e) { Utils.toast(e.message, 'error'); }
    Utils.btnLoading(btn, false);
  });

  document.getElementById('food-logs-list')?.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-del-food]');
    if (!delBtn) return;
    const id = delBtn.dataset.delFood;
    const ok = await Utils.confirm('¿Eliminar este registro de alimentos?');
    if (!ok) return;
    try {
      await API.deleteFoodLog(id);
      logFoodLogs = logFoodLogs.filter(f => String(f.id) !== String(id));
      const listEl = document.getElementById('food-logs-list');
      if (listEl) listEl.innerHTML = _renderFoodLogsList(logFoodLogs);
      Utils.toast('Eliminado ✓', 'success');
    } catch (e) { Utils.toast(e.message, 'error'); }
  });
}

function _renderFoodChips(items) {
  if (!items || !items.length) return '<span class="text-muted small">Sin alimentos aun</span>';
  return items.map((item, i) =>
    `<span class="food-chip">${Utils.escHtml(item)}
       <button class="food-chip-rm" data-remove-food="${i}" title="Quitar">&times;</button>
     </span>`).join('');
}

function _renderFoodLogsList(logs) {
  if (!logs || !logs.length) return '<p class="text-muted small">No hay alimentos registrados para este dia.</p>';
  const mealLabel = { desayuno: '☀️ Desayuno', almuerzo: '🥗 Almuerzo', cena: '🌙 Cena', snack: '🍎 Snack', otro: '🍽️ Otro' };
  return logs.map(log => {
    const label = mealLabel[log.meal_type] || log.meal_type;
    const foods = (log.foods || []).map(f => Utils.escHtml(f)).join(', ');
    return `<div class="food-log-entry" style="display:flex;justify-content:space-between;align-items:flex-start;padding:.6rem .75rem;background:var(--bg-subtle);border-radius:var(--radius-sm);margin-bottom:.4rem">
      <div>
        <span class="badge badge-muted" style="margin-right:.4rem">${label}</span>
        <span>${foods}</span>
        ${log.notes ? `<div class="text-muted small mt-1">${Utils.escHtml(log.notes)}</div>` : ''}
      </div>
      <button class="btn-icon btn-icon-danger" data-del-food="${log.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
    </div>`;
  }).join('');
}

window.renderLog = renderLog;
