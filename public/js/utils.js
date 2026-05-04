/* ============================================================
   utils.js  —  Utilidades globales
   ============================================================ */

// ── Fechas ────────────────────────────────────────────────
const Utils = {
  // 2024-05-03 → "3 de mayo de 2024"
  formatDate(dateStr, opts = {}) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', ...opts });
  },

  // Fecha relativa (hace 2 días / hoy / mañana)
  formatRelative(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const now  = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff  = Math.round((date - today) / 86400000);
    if (diff === 0)  return 'Hoy';
    if (diff === 1)  return 'Mañana';
    if (diff === -1) return 'Ayer';
    if (diff > 1 && diff <= 7)   return `En ${diff} días`;
    if (diff < -1 && diff >= -7) return `Hace ${Math.abs(diff)} días`;
    return this.formatDate(dateStr);
  },

  // Hoy como YYYY-MM-DD
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  // YYYY-MM-DD → Date (local, sin UTC shift)
  parseLocalDate(str) {
    const [y,m,d] = str.split('-').map(Number);
    return new Date(y, m-1, d);
  },

  addDays(dateStr, days) {
    const d = this.parseLocalDate(dateStr);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  diffDays(a, b) {
    return Math.round((this.parseLocalDate(a) - this.parseLocalDate(b)) / 86400000);
  },

  isBetween(date, start, end) {
    return date >= start && date <= end;
  },

  // ── Fases del ciclo ───────────────────────────────────────
  phaseInfo(phase) {
    const phases = {
      menstrual:  { label: 'Fase menstrual',  emoji: '🩸', color: '#C2185B', tip: 'Descansa y cuídate. Es normal sentir cólicos.' },
      folicular:  { label: 'Fase folicular',  emoji: '🌱', color: '#2E7D32', tip: 'Tu energía va en aumento. ¡Buen momento para nuevos proyectos!' },
      fertil:     { label: 'Ventana fértil',  emoji: '🌸', color: '#7B1FA2', tip: 'Alta posibilidad de embarazo. Sé consciente de tu fertilidad.' },
      ovulacion:  { label: 'Ovulación',       emoji: '⚡', color: '#E65100', tip: 'Día de máxima fertilidad. Energía al tope.' },
      lutea:      { label: 'Fase lútea',       emoji: '🌙', color: '#1565C0', tip: 'Puede que notes cambios emocionales. Practica autocuidado.' },
    };
    return phases[phase] || { label: phase, emoji: '🔄', color: '#666', tip: '' };
  },

  // ── Intensidad sangrado ───────────────────────────────────
  flowInfo(intensity) {
    const map = {
      spotting:   { label: 'Manchado',   emoji: '·',  color: '#FFCDD2' },
      light:      { label: 'Leve',       emoji: '💧', color: '#EF9A9A' },
      medium:     { label: 'Moderado',   emoji: '💧💧', color: '#E57373' },
      heavy:      { label: 'Abundante',  emoji: '💧💧💧', color: '#EF5350' },
      very_heavy: { label: 'Muy abundante', emoji: '🩸', color: '#C62828' },
    };
    return map[intensity] || { label: intensity, emoji: '', color: '#ccc' };
  },

  // ── Estado de ánimo ───────────────────────────────────────
  moodInfo(mood) {
    const map = {
      muy_bien:  { label: 'Muy bien',   emoji: '😁' },
      bien:      { label: 'Bien',       emoji: '😊' },
      neutral:   { label: 'Neutral',    emoji: '😐' },
      mal:       { label: 'Mal',        emoji: '😔' },
      muy_mal:   { label: 'Muy mal',    emoji: '😢' },
      ansiosa:   { label: 'Ansiosa',    emoji: '😰' },
      irritable: { label: 'Irritable',  emoji: '😤' },
      triste:    { label: 'Triste',     emoji: '😞' },
      feliz:     { label: 'Feliz',      emoji: '😄' },
      energica:  { label: 'Con energía',emoji: '⚡' },
      cansada:   { label: 'Cansada',    emoji: '😩' },
      sensible:  { label: 'Sensible',   emoji: '🥺' },
      romantica: { label: 'Romántica',  emoji: '💕' },
    };
    return map[mood] || { label: mood, emoji: '😐' };
  },

  // ── Escape HTML ──────────────────────────────────────────
  escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  // ── Frecuencia ────────────────────────────────────────────
  frequencyLabel(freq) {
    const map = {
      daily:       'Diario',
      weekly:      'Semanal',
      monthly:     'Mensual',
      as_needed:   'Cuando sea necesario',
      cycle_only:  'Solo durante el ciclo',
    };
    return map[freq] || freq;
  },

  // ── DOM helpers ───────────────────────────────────────────
  $(sel, ctx = document)    { return ctx.querySelector(sel); },
  $$(sel, ctx = document)   { return [...ctx.querySelectorAll(sel)]; },

  el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    children.forEach(c => e.append(c));
    return e;
  },

  // ── Toast ─────────────────────────────────────────────────
  toast(message, type = 'success', duration = 4000) {
    const icons = { success:'fa-check-circle', error:'fa-circle-exclamation', info:'fa-circle-info', warning:'fa-triangle-exclamation' };
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  },

  // ── Modal ─────────────────────────────────────────────────
  modal: {
    open(title, bodyHtml, footerHtml = '') {
      document.getElementById('modal-title').textContent = title;
      document.getElementById('modal-body').innerHTML   = bodyHtml;
      document.getElementById('modal-footer').innerHTML = footerHtml;
      document.getElementById('modal-overlay').classList.remove('hidden');
    },
    close() {
      document.getElementById('modal-overlay').classList.add('hidden');
    },
  },

  // ── Confirm dialog ────────────────────────────────────────
  // Supports both Promise-style and legacy callback style:
  //   await Utils.confirm('msg', 'detail')  → true/false
  //   Utils.confirm('msg', callbackFn)      → legacy (medications.js)
  confirm(msg, callbackOrDetail = '') {
    if (typeof callbackOrDetail === 'function') {
      // Legacy callback API
      const onConfirm = callbackOrDetail;
      Utils.modal.open('Confirmar', `<p>${msg}</p>`,
        `<button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
         <button class="btn btn-danger" id="modal-confirm">Confirmar</button>`);
      document.getElementById('modal-cancel')?.addEventListener('click', Utils.modal.close);
      document.getElementById('modal-confirm')?.addEventListener('click', () => { Utils.modal.close(); onConfirm(); });
      return undefined;
    }
    // Promise API
    const detail = callbackOrDetail;
    return new Promise((resolve) => {
      Utils.modal.open('Confirmar',
        `<p>${msg}</p>${detail ? `<p style="font-size:.875rem;color:var(--text-muted)">${detail}</p>` : ''}`,
        `<button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
         <button class="btn btn-danger" id="modal-confirm">Confirmar</button>`);
      document.getElementById('modal-cancel')?.addEventListener('click', () => { Utils.modal.close(); resolve(false); });
      document.getElementById('modal-confirm')?.addEventListener('click', () => { Utils.modal.close(); resolve(true); });
    });
  },

  // ── Loading state para botones ────────────────────────────
  btnLoading(btn, loading, _text) {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
    const spinner = btn.querySelector('.btn-spinner');
    if (spinner) spinner.classList.toggle('hidden', !loading);
  },

  // ── Capitalizar ───────────────────────────────────────────
  cap(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; },

  // ── Debounce ──────────────────────────────────────────────
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  },
};

window.Utils = Utils;
