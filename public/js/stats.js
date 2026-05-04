/* ============================================================
   stats.js  —  Estadísticas y gráficas con Chart.js
   ============================================================ */

let _charts = {};   // Chart instances to destroy on re-render

function destroyCharts() {
  Object.values(_charts).forEach(c => { try { c.destroy(); } catch {} });
  _charts = {};
}

async function renderStats(container) {
  destroyCharts();
  container.innerHTML = `<div class="page-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;

  try {
    const [summary, cycleHistory, symptomsFreq, moodPatterns, flowAnalysis, predictions] = await Promise.all([
      API.getSummary(),
      API.getCycleHistory(),
      API.getSymptomsFreq(),
      API.getMoodPatterns(),
      API.getFlowAnalysis(),
      API.getPredictions(),
    ]);
    buildStatsPage(container, { summary, cycleHistory, symptomsFreq, moodPatterns, flowAnalysis, predictions });
  } catch (e) {
    Utils.toast(e.message, 'error');
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>${e.message}</h3></div>`;
  }
}

function buildStatsPage(container, { summary, cycleHistory, symptomsFreq, moodPatterns, flowAnalysis, predictions }) {
  const pred = summary.predictions;
  const reg  = summary.regularity;

  const regBadgeClass = { regular: 'reg-regular', irregular: 'reg-irregular', muy_irregular: 'reg-muy_irregular' };
  const regLabel = { regular: '✓ Regular', irregular: '⚠ Irregular', muy_irregular: '⚠ Muy irregular' };

  container.innerHTML = `
    <h1 class="page-title">Estadísticas</h1>

    <!-- Summary boxes -->
    <div class="kpi-grid mb-2">
      <div class="kpi-card" style="--kpi-color:var(--primary)">
        <div class="kpi-icon">🔄</div>
        <div class="kpi-value">${pred?.avgCycleLen || summary.cyclesTracked > 0 ? pred?.avgCycleLen : '—'}</div>
        <div class="kpi-label">Ciclo promedio (días)</div>
        <div class="kpi-sub">${summary.cyclesTracked} ciclo(s) registrado(s)</div>
      </div>
      <div class="kpi-card" style="--kpi-color:var(--accent)">
        <div class="kpi-icon">🩸</div>
        <div class="kpi-value">${pred?.avgPeriodLen || '—'}</div>
        <div class="kpi-label">Período promedio (días)</div>
        <div class="kpi-sub">Duración del sangrado</div>
      </div>
      <div class="kpi-card" style="--kpi-color:var(--secondary)">
        <div class="kpi-icon">📊</div>
        <div class="kpi-value">${summary.totalSymptomEntries}</div>
        <div class="kpi-label">Síntomas registrados</div>
        <div class="kpi-sub">Total histórico</div>
      </div>
      <div class="kpi-card" style="--kpi-color:var(--info)">
        <div class="kpi-icon">😊</div>
        <div class="kpi-value">${summary.totalMoodEntries}</div>
        <div class="kpi-label">Registros de ánimo</div>
        <div class="kpi-sub">Total histórico</div>
      </div>
    </div>

    ${reg ? `<div style="margin-bottom:1.25rem">
      <span class="regularity-badge ${regBadgeClass[reg] || 'reg-regular'}">${regLabel[reg] || reg}</span>
    </div>` : ''}

    <!-- Upcoming cycles prediction -->
    ${predictions?.upcomingCycles ? `
    <div class="card mb-2">
      <div class="card-header"><span class="card-title">🔮 Próximas predicciones</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem">
        ${predictions.upcomingCycles.map((c, i) => `
          <div style="background:var(--bg-subtle);border-radius:var(--radius-sm);padding:1rem;text-align:center">
            <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:.4rem">Ciclo +${c.cycleNumber}</div>
            <div style="font-weight:700;color:var(--primary)">${Utils.formatDate(c.periodStart,{day:'numeric',month:'short'})}</div>
            <div style="font-size:.8rem;color:var(--text-secondary)">→ ${Utils.formatDate(c.periodEnd,{day:'numeric',month:'short'})}</div>
            <div style="font-size:.75rem;color:var(--secondary);margin-top:.25rem">⚡ Ovul. ${Utils.formatDate(c.ovulationDay,{day:'numeric',month:'short'})}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="stats-grid">
      <!-- Cycle length chart -->
      <div class="chart-card" style="grid-column:1/-1">
        <div class="chart-title">Duración de ciclos</div>
        <div class="chart-sub">Longitud de cada ciclo registrado (días)</div>
        <div class="chart-wrap" style="max-height:220px"><canvas id="chart-cycles"></canvas></div>
      </div>

      <!-- Symptoms frequency -->
      <div class="chart-card">
        <div class="chart-title">Síntomas más frecuentes</div>
        <div class="chart-sub">Últimos 6 meses</div>
        <div class="chart-wrap"><canvas id="chart-symptoms"></canvas></div>
      </div>

      <!-- Mood distribution -->
      <div class="chart-card">
        <div class="chart-title">Distribución de ánimo</div>
        <div class="chart-sub">Últimos 3 meses</div>
        <div class="chart-wrap"><canvas id="chart-moods"></canvas></div>
      </div>

      <!-- Flow analysis -->
      <div class="chart-card">
        <div class="chart-title">Análisis de flujo</div>
        <div class="chart-sub">Distribución por intensidad</div>
        <div class="chart-wrap"><canvas id="chart-flow"></canvas></div>
      </div>

      <!-- Period length -->
      <div class="chart-card">
        <div class="chart-title">Duración de períodos</div>
        <div class="chart-sub">Días de sangrado por ciclo</div>
        <div class="chart-wrap"><canvas id="chart-period-len"></canvas></div>
      </div>
    </div>

    <!-- Export button -->
    <div style="margin-top:1.5rem;text-align:center">
      <button class="btn btn-ghost" id="export-btn">
        <i class="fa-solid fa-download"></i> Exportar mis datos (JSON)
      </button>
    </div>
  `;

  // Wait for DOM, then render charts
  setTimeout(() => drawCharts({ cycleHistory, symptomsFreq, moodPatterns, flowAnalysis }), 50);

  // Export
  document.getElementById('export-btn')?.addEventListener('click', async () => {
    try {
      const data = await API.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `luna-datos-${Utils.today()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Utils.toast('Datos exportados ✓', 'success');
    } catch (e) { Utils.toast(e.message, 'error'); }
  });
}

function drawCharts({ cycleHistory, symptomsFreq, moodPatterns, flowAnalysis }) {
  const fontColor = '#6B4C6B';
  const gridColor = '#FCE4EC';

  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.color       = fontColor;

  // ── 1. Cycle lengths ──────────────────────────────────────
  const clEl = document.getElementById('chart-cycles');
  if (clEl && cycleHistory.length > 0) {
    const completed = cycleHistory.filter(c => c.cycle_length);
    _charts.cycles = new Chart(clEl, {
      type: 'line',
      data: {
        labels: completed.map(c => Utils.formatDate(c.start_date, {month:'short', year:'2-digit'})),
        datasets: [{
          label: 'Duración del ciclo (días)',
          data:  completed.map(c => c.cycle_length),
          borderColor:     '#C2185B',
          backgroundColor: 'rgba(194,24,91,.1)',
          tension: .3, fill: true, pointRadius: 4,
          pointBackgroundColor: '#C2185B',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: false, min: 18, grid: { color: gridColor } },
          x: { grid: { color: gridColor } },
        },
      },
    });
  }

  // ── 2. Period lengths ─────────────────────────────────────
  const plEl = document.getElementById('chart-period-len');
  if (plEl && cycleHistory.length > 0) {
    const withPeriod = cycleHistory.filter(c => c.period_length);
    _charts.periodLen = new Chart(plEl, {
      type: 'bar',
      data: {
        labels: withPeriod.map(c => Utils.formatDate(c.start_date, {month:'short', year:'2-digit'})),
        datasets: [{
          label: 'Días de sangrado',
          data:  withPeriod.map(c => c.period_length),
          backgroundColor: 'rgba(233,30,140,.6)',
          borderColor:     '#E91E8C',
          borderWidth: 1.5,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: gridColor } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  // ── 3. Symptoms frequency ─────────────────────────────────
  const syEl = document.getElementById('chart-symptoms');
  if (syEl && symptomsFreq.length > 0) {
    _charts.symptoms = new Chart(syEl, {
      type: 'bar',
      data: {
        labels: symptomsFreq.map(s => s.symptom_type),
        datasets: [{
          label: 'Frecuencia',
          data:  symptomsFreq.map(s => parseInt(s.count)),
          backgroundColor: symptomsFreq.map((_, i) => `hsl(${340 - i * 12}, 70%, ${55 + i*3}%)`),
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: gridColor } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  // ── 4. Mood distribution ──────────────────────────────────
  const moEl = document.getElementById('chart-moods');
  if (moEl && moodPatterns.length > 0) {
    const moodColors = {
      muy_bien: '#66BB6A', bien: '#AED581', neutral: '#FFD54F', mal: '#FF8A65',
      muy_mal: '#EF5350', ansiosa: '#AB47BC', irritable: '#FF7043', triste: '#78909C',
      feliz: '#26C6DA', energica: '#FFCA28', cansada: '#8D6E63', sensible: '#EC407A', romantica: '#F06292',
    };
    _charts.moods = new Chart(moEl, {
      type: 'doughnut',
      data: {
        labels: moodPatterns.map(m => Utils.moodInfo(m.mood).emoji + ' ' + Utils.moodInfo(m.mood).label),
        datasets: [{
          data:            moodPatterns.map(m => parseInt(m.count)),
          backgroundColor: moodPatterns.map(m => moodColors[m.mood] || '#ccc'),
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
        },
      },
    });
  }

  // ── 5. Flow intensity distribution ───────────────────────
  const flEl = document.getElementById('chart-flow');
  if (flEl && flowAnalysis.length > 0) {
    const flowColors = {
      spotting:   '#FFCDD2', light: '#EF9A9A', medium: '#E57373',
      heavy:      '#EF5350', very_heavy: '#C62828',
    };
    _charts.flow = new Chart(flEl, {
      type: 'doughnut',
      data: {
        labels: flowAnalysis.map(f => Utils.flowInfo(f.flow_intensity).label),
        datasets: [{
          data:            flowAnalysis.map(f => parseInt(f.count)),
          backgroundColor: flowAnalysis.map(f => flowColors[f.flow_intensity] || '#ccc'),
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
        },
      },
    });
  }
}

window.renderStats = renderStats;
