/* ============================================================
   calendar.js  —  Calendario mensual con ciclo visualizado
   ============================================================ */

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1;

async function renderCalendar(container) {
  container.innerHTML = `
    <h1 class="page-title">Calendario</h1>
    <div class="card" id="cal-card">
      <div class="page-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>
    </div>`;
  await loadCalendarMonth(calYear, calMonth);
}

async function loadCalendarMonth(year, month) {
  const card = document.getElementById('cal-card');
  if (!card) return;
  card.innerHTML = `<div class="page-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;

  try {
    const data = await API.getCalendarData(year, month);
    renderCalendarGrid(card, year, month, data);
  } catch (e) {
    card.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>${e.message}</h3></div>`;
  }
}

function renderCalendarGrid(card, year, month, data) {
  const pred        = data.predictions;
  const periodSet   = new Set(data.periodDays.map(p => p.date));
  const periodMap   = Object.fromEntries(data.periodDays.map(p => [p.date, p.flow_intensity]));
  const moodMap     = Object.fromEntries(data.moods.map(m => [m.date, m.mood]));
  const symptomSet  = new Set(data.symptoms.map(s => s.date));
  const ovulSet     = new Set(data.ovulation.map(o => o.date).filter(d => data.ovulation.find(o => o.date === d && o.lh_test === 'pico')));

  // Predicted days
  const predictedSet = new Set();
  const fertileSet   = new Set();
  let   ovulDay      = null;
  if (pred) {
    // Next period window
    for (let i = 0; i < pred.avgPeriodLen; i++) {
      predictedSet.add(Utils.addDays(pred.nextPeriodStart, i));
    }
    // Fertile window
    let cur = pred.fertileStart;
    while (cur <= pred.fertileEnd) { fertileSet.add(cur); cur = Utils.addDays(cur, 1); }
    ovulDay = pred.ovulationDay;
  }

  const today     = Utils.today();
  const firstDay  = new Date(year, month - 1, 1).getDay();
  const daysInMon = new Date(year, month, 0).getDate();
  const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  const weekdays = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  let daysHtml = weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join('');

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) daysHtml += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= daysInMon; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let classes   = 'cal-day';
    if (dateStr === today) classes += ' today';
    if (periodSet.has(dateStr))    classes += ' period-day';
    else if (predictedSet.has(dateStr)) classes += ' predicted-period';
    else if (dateStr === ovulDay)  classes += ' ovulation-day';
    else if (fertileSet.has(dateStr)) classes += ' fertile-window';

    // Dots
    let dots = '';
    if (moodMap[dateStr])     dots += `<div class="cal-dot dot-mood"></div>`;
    if (symptomSet.has(dateStr)) dots += `<div class="cal-dot dot-symptom"></div>`;
    // notes dot — optional: skip for now to keep it simple

    daysHtml += `
      <div class="${classes}" data-date="${dateStr}">
        <span class="day-num">${d}</span>
        ${dots ? `<div class="cal-dots">${dots}</div>` : ''}
      </div>`;
  }

  card.innerHTML = `
    <div class="calendar-nav">
      <button class="btn btn-sm btn-secondary" id="cal-prev"><i class="fa-solid fa-chevron-left"></i></button>
      <span class="calendar-month-label">${monthName}</span>
      <button class="btn btn-sm btn-secondary" id="cal-next"><i class="fa-solid fa-chevron-right"></i></button>
    </div>

    <div class="calendar-grid">${daysHtml}</div>

    <div class="cal-legend">
      <div class="legend-item"><div class="legend-swatch legend-period"></div> Período</div>
      <div class="legend-item"><div class="legend-swatch legend-predicted"></div> Predicción</div>
      <div class="legend-item"><div class="legend-swatch legend-fertile"></div> Ventana fértil</div>
      <div class="legend-item"><div class="legend-swatch legend-ovulation"></div> Ovulación</div>
      <div class="legend-item"><div class="cal-dot dot-mood" style="width:10px;height:10px"></div> Estado ánimo</div>
      <div class="legend-item"><div class="cal-dot dot-symptom" style="width:10px;height:10px"></div> Síntoma</div>
    </div>`;

  // Navigation
  document.getElementById('cal-prev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 1) { calMonth = 12; calYear--; }
    loadCalendarMonth(calYear, calMonth);
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    loadCalendarMonth(calYear, calMonth);
  });

  // Click on day → show detail modal
  card.querySelectorAll('.cal-day:not(.empty)').forEach(day => {
    day.addEventListener('click', () => showDayModal(day.dataset.date, data, periodSet, moodMap, symptomSet, pred));
  });
}

function showDayModal(dateStr, data, periodSet, moodMap, symptomSet, pred) {
  const periodDay = data.periodDays.find(p => p.date === dateStr);
  const mood      = data.moods.find(m => m.date === dateStr);
  const symptoms  = data.symptoms.filter(s => s.date === dateStr);
  const ovul      = data.ovulation.find(o => o.date === dateStr);

  let bodyHtml = `<p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">${Utils.formatDate(dateStr)}</p>`;

  // Period
  if (periodDay) {
    const fi = Utils.flowInfo(periodDay.flow_intensity);
    bodyHtml += `<div class="card mb-1"><span style="font-weight:700">🩸 Menstruación:</span> ${fi.emoji} ${fi.label}</div>`;
  }

  // Mood
  if (mood) {
    const mi = Utils.moodInfo(mood.mood);
    bodyHtml += `<div class="card mb-1"><span style="font-weight:700">😊 Estado de ánimo:</span> ${mi.emoji} ${mi.label}
      ${mood.energy_level ? ` · Energía: ${'⚡'.repeat(mood.energy_level)}` : ''}
      ${mood.notes ? `<p class="text-muted mt-1">${mood.notes}</p>` : ''}</div>`;
  }

  // Symptoms
  if (symptoms.length > 0) {
    bodyHtml += `<div class="card mb-1"><span style="font-weight:700">🤕 Síntomas:</span>
      <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.4rem">
        ${symptoms.map(s => `<span class="symptom-chip selected" style="cursor:default">${s.symptom_type} <span class="sev-badge">${s.severity}</span></span>`).join('')}
      </div></div>`;
  }

  // Ovulation
  if (ovul) {
    bodyHtml += `<div class="card mb-1"><span style="font-weight:700">🌸 Ovulación:</span>
      ${ovul.cervical_mucus ? `Mucus: ${ovul.cervical_mucus}` : ''}
      ${ovul.bbt ? ` · BBT: ${ovul.bbt}°C` : ''}
      ${ovul.lh_test ? ` · Test LH: ${ovul.lh_test}` : ''}
    </div>`;
  }

  if (!periodDay && !mood && symptoms.length === 0 && !ovul) {
    bodyHtml += `<div class="empty-state" style="padding:1rem">
      <div class="empty-state-icon" style="font-size:1.5rem">📋</div>
      <p>Sin registros para este día.</p>
    </div>`;
  }

  const dateStr_nofuture = dateStr <= Utils.today();
  Utils.modal.open(
    `📅 ${Utils.formatDate(dateStr, {weekday:'long',day:'numeric',month:'long'})}`,
    bodyHtml,
    dateStr_nofuture ? `<button class="btn btn-primary" onclick="Utils.modal.close();window.App.navigate('log','${dateStr}')">Registrar este día</button>` : ''
  );
}

window.renderCalendar = renderCalendar;
