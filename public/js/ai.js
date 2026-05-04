/* ============================================================
   ai.js  -  Pagina de analisis con DeepSeek AI
   ============================================================ */

async function renderAI(container) {
  container.innerHTML = `
    <div class="page-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>
  `;
  let history = [];
  try { history = await API.getAIHistory(); } catch (e) { /* nada */ }
  _buildAIPage(container, history);
}

function _buildAIPage(container, history) {
  container.innerHTML = `
    <div class="ai-page">
      <h1 class="page-title">Analisis con IA <span class="badge badge-primary">DeepSeek</span></h1>
      <p class="text-muted mb-3">
        La IA analiza todos tus datos: ciclos, sintomas, estado de animo,
        medicamentos y <strong>alimentos</strong> para identificar patrones,
        correlaciones y anomalias en tus colicos.
      </p>

      <!-- Configuracion -->
      <div class="card mb-3">
        <div class="card-header"><h3>Nuevo analisis</h3></div>
        <div class="card-body">
          <label class="form-label">Periodo de analisis</label>
          <div class="btn-group mb-3" id="ai-days-group">
            <button class="btn btn-outline ai-days-btn active" data-days="30">30 dias</button>
            <button class="btn btn-outline ai-days-btn" data-days="60">60 dias</button>
            <button class="btn btn-outline ai-days-btn" data-days="90">90 dias</button>
            <button class="btn btn-outline ai-days-btn" data-days="180">6 meses</button>
          </div>
          <div id="ai-warn-food" class="alert alert-warning hidden" style="margin-bottom:.75rem">
            <i class="fa-solid fa-triangle-exclamation"></i>
            No tienes registros de alimentos en este periodo. Agrega comidas
            en la seccion <strong>Registrar hoy &rarr; Alimentos</strong> 
            para que la IA pueda identificar que comidas intensifican tus sintomas.
          </div>
          <button class="btn btn-primary" id="ai-analyze-btn">
            <span class="btn-text"><i class="fa-solid fa-robot"></i> Analizar con IA</span>
            <span class="btn-spinner hidden"><i class="fa-solid fa-spinner fa-spin"></i></span>
          </button>
        </div>
      </div>

      <!-- Resultado -->
      <div id="ai-result-block" class="hidden">
        <div class="card mb-3">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3 style="margin:0">Resultado</h3>
            <span id="ai-result-meta" class="text-muted" style="font-size:.8rem"></span>
          </div>
          <div class="card-body ai-result-body" id="ai-result-content"></div>
        </div>
      </div>

      <!-- Historial -->
      <div id="ai-history-block" class="${history.length ? '' : 'hidden'}">
        <h2 class="section-title">Analisis anteriores</h2>
        <div id="ai-history-list">
          ${history.map(_historyCard).join('')}
        </div>
      </div>

      <!-- Vacio -->
      <div id="ai-empty" class="${history.length ? 'hidden' : ''}">
        <div class="empty-state">
          <div class="empty-state-icon">🤖</div>
          <h3>Sin analisis aun</h3>
          <p>Selecciona un periodo y presiona <em>Analizar con IA</em> para empezar.</p>
        </div>
      </div>
    </div>
  `;

  let _selectedDays = 30;

  // Selector de dias
  document.getElementById('ai-days-group')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.ai-days-btn');
    if (!btn) return;
    document.querySelectorAll('.ai-days-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _selectedDays = parseInt(btn.dataset.days);
  });

  // Boton analizar
  document.getElementById('ai-analyze-btn')?.addEventListener('click', async () => {
    const analyzeBtn = document.getElementById('ai-analyze-btn');
    const warnFood   = document.getElementById('ai-warn-food');

    Utils.btnLoading(analyzeBtn, true, 'Analizando…');
    document.getElementById('ai-result-block')?.classList.add('hidden');
    if (warnFood) warnFood.classList.add('hidden');

    try {
      const data = await API.analyzeAI({ days: _selectedDays });

      // Aviso si no habia registros de alimentos
      if (data.meta && data.meta.dataPoints && data.meta.dataPoints.foodLogs === 0) {
        if (warnFood) warnFood.classList.remove('hidden');
      }

      // Mostrar resultado
      const resultBlock   = document.getElementById('ai-result-block');
      const resultContent = document.getElementById('ai-result-content');
      const resultMeta    = document.getElementById('ai-result-meta');

      if (resultContent) resultContent.innerHTML = _markdownToHtml(data.analysis || '');
      if (resultMeta && data.meta) {
        resultMeta.textContent =
          `Modelo: ${data.meta.model || 'deepseek-chat'} · ` +
          `${data.meta.period || _selectedDays} dias · ` +
          `${data.meta.tokens || '?'} tokens`;
      }
      if (resultBlock) resultBlock.classList.remove('hidden');

      // Ocultar vacio
      document.getElementById('ai-empty')?.classList.add('hidden');

      // Refrescar historial
      try {
        const newHistory = await API.getAIHistory();
        const histList   = document.getElementById('ai-history-list');
        const histBlock  = document.getElementById('ai-history-block');
        if (histList) histList.innerHTML = newHistory.map(_historyCard).join('');
        if (histBlock) histBlock.classList.remove('hidden');
      } catch (e) { /* ignorar */ }

    } catch (err) {
      Utils.toast(err.message || 'Error al analizar', 'error');
    } finally {
      Utils.btnLoading(analyzeBtn, false, null);
    }
  });

  // Expandir analisis previo
  document.getElementById('ai-history-list')?.addEventListener('click', async (e) => {
    const expandBtn = e.target.closest('[data-action="expand-ai"]');
    if (!expandBtn) return;
    const id   = expandBtn.dataset.id;
    const card = expandBtn.closest('.ai-history-card');
    if (!card) return;
    const body = card.querySelector('.ai-history-body');
    if (!body) return;
    if (body.classList.contains('hidden')) {
      body.classList.remove('hidden');
      expandBtn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
    } else {
      body.classList.add('hidden');
      expandBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
    }
  });
}

function _historyCard(item) {
  const date    = Utils.formatDate(item.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
  const preview = (item.preview || item.result || '').substring(0, 160).replace(/\n/g, ' ');

  return `
    <div class="ai-history-card card mb-2">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer"
           data-action="expand-ai" data-id="${item.id}">
        <div>
          <span class="badge badge-muted">${item.period_days} dias</span>
          <span class="text-muted" style="font-size:.8rem;margin-left:.5rem">${date}</span>
        </div>
        <button class="btn-icon" data-action="expand-ai" data-id="${item.id}">
          <i class="fa-solid fa-chevron-down"></i>
        </button>
      </div>
      <div class="ai-history-body card-body hidden">
        <p class="text-muted small mb-2">${Utils.escHtml(preview)}…</p>
        <div class="ai-result-body">${_markdownToHtml(item.result || item.preview || '')}</div>
      </div>
    </div>
  `;
}

/*
 * Convierte el subset de Markdown que devuelve DeepSeek a HTML seguro.
 * Solo transforma: ### h3, ## h2, **bold**, * bullet lists, lineas en blanco -> parrafos
 */
function _markdownToHtml(text) {
  if (!text) return '';

  // Separar en parrafos por lineas en blanco
  const paragraphs = text.split(/\n{2,}/);

  const lines = paragraphs.map(para => {
    para = para.trim();
    if (!para) return '';

    // Lista de bullets
    if (/^[*\-] /m.test(para)) {
      const items = para.split('\n')
        .filter(l => l.trim())
        .map(l => `<li>${_inlineMarkdown(l.replace(/^[*\-] /, '').trim())}</li>`)
        .join('');
      return `<ul class="ai-list">${items}</ul>`;
    }

    // Encabezados
    if (para.startsWith('### ')) return `<h4 class="ai-h4">${_inlineMarkdown(para.slice(4))}</h4>`;
    if (para.startsWith('## '))  return `<h3 class="ai-h3">${_inlineMarkdown(para.slice(3))}</h3>`;
    if (para.startsWith('# '))   return `<h3 class="ai-h3">${_inlineMarkdown(para.slice(2))}</h3>`;

    // Lineas individuales como parrafo
    return `<p class="ai-p">${para.split('\n').map(_inlineMarkdown).join('<br>')}</p>`;
  });

  return lines.join('');
}

function _inlineMarkdown(text) {
  // Escapar HTML primero para evitar injection, luego restaurar las marcas
  let s = Utils.escHtml(text);
  // **bold**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // *italic*
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // `code`
  s = s.replace(/`(.+?)`/g, '<code>$1</code>');
  return s;
}

window.renderAI = renderAI;
