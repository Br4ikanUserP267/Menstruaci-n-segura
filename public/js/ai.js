/* ============================================================
   ai.js  -  Pagina de analisis con DeepSeek AI
   ============================================================ */

async function renderAI(container) {
  container.innerHTML = `<div class="page-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;
  let history = [];
  try { history = await API.getAIHistory(); } catch (_) {}
  _buildAIPage(container, history);
}

function _buildAIPage(container, history) {
  container.innerHTML = `
    <div class="ai-page">
      <h1 class="page-title">Analisis con IA <span class="badge badge-primary">DeepSeek</span></h1>

      <!-- Tabs -->
      <div class="log-tabs ai-tabs">
        <button class="log-tab active" data-ai-tab="analysis">📊 Analisis completo</button>
        <button class="log-tab"        data-ai-tab="chat">💬 Preguntas libres</button>
      </div>

      <!-- ══ TAB: ANALISIS ══ -->
      <div class="ai-tab-content" id="ai-tab-analysis">
        <p class="text-muted mb-3">
          La IA analiza todos tus datos: ciclos, sintomas, alimentos y medicamentos
          para detectar patrones, correlaciones y anomalias en tus colicos.
        </p>
        <div class="card mb-3">
          <div class="card-header"><h3>Periodo de analisis</h3></div>
          <div class="card-body">
            <div class="btn-group mb-3" id="ai-days-group">
              <button class="btn btn-outline ai-days-btn active" data-days="30">30 dias</button>
              <button class="btn btn-outline ai-days-btn" data-days="60">60 dias</button>
              <button class="btn btn-outline ai-days-btn" data-days="90">90 dias</button>
              <button class="btn btn-outline ai-days-btn" data-days="180">6 meses</button>
            </div>
            <div id="ai-warn-food" class="alert alert-warning hidden">
              <i class="fa-solid fa-triangle-exclamation"></i>
              No tienes registros de alimentos. Agrega comidas en
              <strong>Registrar hoy &rarr; Alimentos</strong> para mejores correlaciones.
            </div>
            <button class="btn btn-primary" id="ai-analyze-btn">
              <span class="btn-text"><i class="fa-solid fa-robot"></i> Analizar con IA</span>
              <span class="btn-spinner hidden"><i class="fa-solid fa-spinner fa-spin"></i></span>
            </button>
          </div>
        </div>

        <div id="ai-result-block" class="hidden">
          <div class="card mb-3">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
              <h3 style="margin:0">Resultado</h3>
              <span id="ai-result-meta" class="text-muted" style="font-size:.8rem"></span>
            </div>
            <div class="card-body ai-result-body" id="ai-result-content"></div>
          </div>
        </div>

        <div id="ai-history-block" class="${history.length ? '' : 'hidden'}">
          <h2 class="section-title">Analisis anteriores</h2>
          <div id="ai-history-list">${history.map(_historyCard).join('')}</div>
        </div>

        <div id="ai-empty" class="${history.length ? 'hidden' : ''}">
          <div class="empty-state">
            <div class="empty-state-icon">🤖</div>
            <h3>Sin analisis aun</h3>
            <p>Selecciona un periodo y presiona <em>Analizar con IA</em>.</p>
          </div>
        </div>
      </div>

      <!-- ══ TAB: CHAT ══ -->
      <div class="ai-tab-content hidden" id="ai-tab-chat">
        <p class="text-muted mb-3">
          Hazle cualquier pregunta a Luna sobre tu ciclo, sintomas, alimentos o bienestar.
          Responde en tiempo real con acceso a tus datos.
        </p>

        <!-- Sugerencias rapidas -->
        <div class="chat-suggestions mb-3" id="chat-suggestions">
          <span class="chat-suggestion" data-q="¿Qué alimentos me recomiendas durante mi período?">🍽️ Alimentos durante el periodo</span>
          <span class="chat-suggestion" data-q="¿Por qué tengo cólicos tan fuertes?">😣 Por que tengo colicos fuertes</span>
          <span class="chat-suggestion" data-q="¿Cómo puedo reducir la hinchazón?">🫃 Como reducir la hinchazon</span>
          <span class="chat-suggestion" data-q="¿Mis síntomas son normales?">🤔 Mis sintomas son normales</span>
          <span class="chat-suggestion" data-q="¿Qué ejercicios me ayudan en mi ciclo?">🏃 Ejercicios para mi ciclo</span>
          <span class="chat-suggestion" data-q="¿Cómo mejorar mi energía en días difíciles?">⚡ Mejorar energia</span>
        </div>

        <!-- Historial del chat -->
        <div class="chat-messages" id="chat-messages"></div>

        <!-- Input -->
        <div class="chat-input-wrap">
          <textarea
            id="chat-input"
            class="chat-input"
            placeholder="Escribe tu pregunta... (Enter para enviar, Shift+Enter nueva linea)"
            rows="2"
            maxlength="1000"
          ></textarea>
          <button class="btn btn-primary chat-send-btn" id="chat-send-btn" disabled>
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </div>
        <div class="chat-hint text-muted small">Luna usa tus datos de los ultimos 60 dias como contexto.</div>
      </div>
    </div>
  `;

  _registerAnalysisHandlers(container, history);
  _registerChatHandlers();
}

/* =========================================================
   ANALYSIS TAB HANDLERS
   ========================================================= */
function _registerAnalysisHandlers(container, history) {
  let selectedDays = 30;

  document.getElementById('ai-days-group')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.ai-days-btn');
    if (!btn) return;
    document.querySelectorAll('.ai-days-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDays = parseInt(btn.dataset.days);
  });

  document.getElementById('ai-analyze-btn')?.addEventListener('click', async () => {
    const analyzeBtn    = document.getElementById('ai-analyze-btn');
    const warnFood      = document.getElementById('ai-warn-food');
    const resultBlock   = document.getElementById('ai-result-block');
    const resultContent = document.getElementById('ai-result-content');
    const resultMeta    = document.getElementById('ai-result-meta');

    Utils.btnLoading(analyzeBtn, true, 'Analizando…');
    resultBlock?.classList.add('hidden');
    warnFood?.classList.add('hidden');

    try {
      const data = await API.analyzeAI({ days: selectedDays });

      if (data.meta?.dataPoints?.foodLogs === 0) {
        warnFood?.classList.remove('hidden');
      }
      if (resultContent) resultContent.innerHTML = _markdownToHtml(data.analysis || '');
      if (resultMeta && data.meta) {
        resultMeta.textContent =
          `Modelo: ${data.meta.model || 'deepseek-chat'} · ${data.meta.period?.days || selectedDays} dias · ${data.meta.tokens || '?'} tokens`;
      }
      resultBlock?.classList.remove('hidden');
      document.getElementById('ai-empty')?.classList.add('hidden');

      // Refresh history
      try {
        const newHistory = await API.getAIHistory();
        const histList  = document.getElementById('ai-history-list');
        const histBlock = document.getElementById('ai-history-block');
        if (histList) histList.innerHTML = newHistory.map(_historyCard).join('');
        if (histBlock) histBlock.classList.remove('hidden');
      } catch (_) {}

    } catch (err) {
      Utils.toast(err.message || 'Error al analizar', 'error');
    } finally {
      Utils.btnLoading(analyzeBtn, false, null);
    }
  });

  // History expand/collapse
  document.getElementById('ai-history-list')?.addEventListener('click', (e) => {
    const card = e.target.closest('.ai-history-card');
    if (!card) return;
    const body = card.querySelector('.ai-history-body');
    if (!body) return;
    const isHidden = body.classList.toggle('hidden');
    const icon = card.querySelector('.ai-hist-toggle i');
    if (icon) icon.className = isHidden ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
  });
}

/* =========================================================
   CHAT TAB HANDLERS
   ========================================================= */
let _chatStreaming = false;

function _registerChatHandlers() {
  // Tab switcher
  document.querySelectorAll('[data-ai-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ai-tab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ai-tab-content').forEach(c => c.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`ai-tab-${btn.dataset.aiTab}`)?.classList.remove('hidden');
    });
  });

  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  // Enable/disable send button
  input?.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim() || _chatStreaming;
  });

  // Enter to send (Shift+Enter for newline)
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendBtn.click();
    }
  });

  sendBtn?.addEventListener('click', () => {
    const msg = input?.value.trim();
    if (!msg || _chatStreaming) return;
    _sendChatMessage(msg);
    if (input) input.value = '';
    sendBtn.disabled = true;
  });

  // Quick suggestion chips
  document.getElementById('chat-suggestions')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.chat-suggestion');
    if (!chip || _chatStreaming) return;
    _sendChatMessage(chip.dataset.q);
  });
}

async function _sendChatMessage(text) {
  if (_chatStreaming) return;
  _chatStreaming = true;

  const messagesEl = document.getElementById('chat-messages');
  const sendBtn    = document.getElementById('chat-send-btn');
  const input      = document.getElementById('chat-input');

  // Hide suggestions after first message
  document.getElementById('chat-suggestions')?.classList.add('hidden');

  // Append user bubble
  _appendChatBubble(messagesEl, 'user', text);

  // Append empty assistant bubble with cursor
  const assistantBubble = _appendChatBubble(messagesEl, 'assistant', '');
  const contentSpan = assistantBubble.querySelector('.chat-bubble-text');
  contentSpan.innerHTML = '<span class="chat-cursor">▍</span>';
  messagesEl.scrollTop = messagesEl.scrollHeight;

  let fullText = '';

  try {
    const token = localStorage.getItem('luna_token') || '';
    const resp  = await fetch('/api/ai/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ message: text }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      throw new Error(err.error || 'Error del servidor');
    }

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        if (t === 'data: [DONE]') break;
        if (!t.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(t.slice(6));
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.t) {
            fullText += parsed.t;
            contentSpan.innerHTML = _markdownToHtml(fullText) + '<span class="chat-cursor">▍</span>';
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        } catch (parseErr) {
          if (parseErr.message !== 'Unexpected end of JSON input') throw parseErr;
        }
      }
    }

    // Final render without cursor
    contentSpan.innerHTML = fullText ? _markdownToHtml(fullText) : '<em class="text-muted">Sin respuesta.</em>';

  } catch (err) {
    contentSpan.innerHTML = `<span class="chat-error"><i class="fa-solid fa-circle-exclamation"></i> ${Utils.escHtml(err.message)}</span>`;
    Utils.toast(err.message, 'error');
  } finally {
    _chatStreaming = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (sendBtn) sendBtn.disabled = !input?.value.trim();
  }
}

function _appendChatBubble(container, role, text) {
  const div = document.createElement('div');
  div.className = `chat-bubble chat-bubble-${role}`;
  div.innerHTML = `
    <div class="chat-bubble-avatar">${role === 'user' ? '<i class="fa-solid fa-user"></i>' : '🌙'}</div>
    <div class="chat-bubble-body">
      <span class="chat-bubble-text">${text ? _markdownToHtml(text) : ''}</span>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

/* =========================================================
   HISTORY CARD
   ========================================================= */
function _historyCard(item) {
  const date    = Utils.formatDate(item.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
  const preview = (item.preview || item.result || '').substring(0, 160).replace(/\n/g, ' ');
  return `
    <div class="ai-history-card card mb-2">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer">
        <div>
          <span class="badge badge-muted">${item.period_days} dias</span>
          <span class="text-muted" style="font-size:.8rem;margin-left:.5rem">${date}</span>
        </div>
        <button class="btn-icon ai-hist-toggle"><i class="fa-solid fa-chevron-down"></i></button>
      </div>
      <div class="ai-history-body card-body hidden">
        <p class="text-muted small mb-2">${Utils.escHtml(preview)}…</p>
        <div class="ai-result-body">${_markdownToHtml(item.result || item.preview || '')}</div>
      </div>
    </div>
  `;
}

/* =========================================================
   MARKDOWN → HTML  (safe subset)
   ========================================================= */
function _markdownToHtml(text) {
  if (!text) return '';
  return text.split(/\n{2,}/).map(para => {
    para = para.trim();
    if (!para) return '';
    // Bullet list
    if (/^[*\-] /m.test(para)) {
      const items = para.split('\n').filter(l => l.trim())
        .map(l => `<li>${_inline(l.replace(/^[*\-] /, '').trim())}</li>`).join('');
      return `<ul class="ai-list">${items}</ul>`;
    }
    // Numbered list
    if (/^\d+\. /m.test(para)) {
      const items = para.split('\n').filter(l => l.trim())
        .map(l => `<li>${_inline(l.replace(/^\d+\. /, '').trim())}</li>`).join('');
      return `<ol class="ai-list">${items}</ol>`;
    }
    if (para.startsWith('### ')) return `<h4 class="ai-h4">${_inline(para.slice(4))}</h4>`;
    if (para.startsWith('## '))  return `<h3 class="ai-h3">${_inline(para.slice(3))}</h3>`;
    if (para.startsWith('# '))   return `<h3 class="ai-h3">${_inline(para.slice(2))}</h3>`;
    return `<p class="ai-p">${para.split('\n').map(_inline).join('<br>')}</p>`;
  }).join('');
}

function _inline(text) {
  let s = Utils.escHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g,     '<em>$1</em>');
  s = s.replace(/`(.+?)`/g,       '<code>$1</code>');
  return s;
}

window.renderAI = renderAI;
