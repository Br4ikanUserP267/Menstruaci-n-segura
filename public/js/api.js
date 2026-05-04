/* ============================================================
   api.js  —  Wrapper de fetch para la API de Luna
   Inyecta el token JWT automáticamente en cada petición.
   ============================================================ */

const API = {
  _base: '/api',

  _headers() {
    const token = localStorage.getItem('luna_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  },

  async _request(method, path, body = null) {
    const opts = {
      method,
      headers: this._headers(),
    };
    if (body !== null) opts.body = JSON.stringify(body);

    const res = await fetch(`${this._base}${path}`, opts);

    if (res.status === 401) {
      // Token expirado o inválido
      localStorage.removeItem('luna_token');
      localStorage.removeItem('luna_user');
      if (window.App) window.App.showAuth();
      throw new Error('Sesión expirada.');
    }

    let data;
    try { data = await res.json(); } catch { data = null; }

    if (!res.ok) {
      const msg = data?.error || (Array.isArray(data?.errors) ? data.errors.map(e => e.msg).join(' ') : 'Error desconocido.');
      throw new Error(msg);
    }
    return data;
  },

  get(path)         { return this._request('GET',    path); },
  post(path, body)  { return this._request('POST',   path, body); },
  put(path, body)   { return this._request('PUT',    path, body); },
  patch(path, body) { return this._request('PATCH',  path, body); },
  del(path)         { return this._request('DELETE', path); },

  // ── Auth ──────────────────────────────────────────────────
  register(username, password) { return this.post('/auth/register', { username, password }); },
  login(username, password)    { return this.post('/auth/login', { username, password }); },
  me()                         { return this.get('/auth/me'); },
  getMe()                      { return this.me(); },  // alias
  updateProfile(data)          { return this.put('/auth/profile', data); },
  changePassword(data)         { return this.put('/auth/password', data); },

  // ── Cycles ────────────────────────────────────────────────
  getCycles(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/cycles${q ? '?' + q : ''}`);
  },
  getCurrentCycle()         { return this.get('/cycles/current'); },
  getPeriodDays(params = {}){ return this.get('/cycles/period-days?' + new URLSearchParams(params)); },
  startCycle(data)          { return this.post('/cycles', data); },
  updateCycle(id, data)     { return this.put(`/cycles/${id}`, data); },
  deleteCycle(id)           { return this.del(`/cycles/${id}`); },
  logPeriodDay(data)        { return this.post('/cycles/period-day', data); },
  deletePeriodDay(id)       { return this.del(`/cycles/period-day/${id}`); },

  // ── Symptoms ──────────────────────────────────────────────
  getSymptoms(params = {})  { return this.get('/symptoms?' + new URLSearchParams(params)); },
  getSymptomCatalog()       { return this.get('/symptoms/catalog'); },
  addSymptom(data)          { return this.post('/symptoms', data); },
  updateSymptom(id, data)   { return this.put(`/symptoms/${id}`, data); },
  deleteSymptom(id)         { return this.del(`/symptoms/${id}`); },

  // ── Moods ─────────────────────────────────────────────────
  getMoods(params = {})     { return this.get('/moods?' + new URLSearchParams(params)); },
  logMood(data)             { return this.post('/moods', data); },
  updateMood(id, data)      { return this.put(`/moods/${id}`, data); },
  deleteMood(id)            { return this.del(`/moods/${id}`); },

  // ── Medications ───────────────────────────────────────────
  getMedications(params={}) { return this.get('/medications?' + new URLSearchParams(params)); },
  getTodayMedications()     { return this.get('/medications/today'); },
  getMedLogs(params={})     { return this.get('/medications/logs?' + new URLSearchParams(params)); },
  addMedication(data)       { return this.post('/medications', data); },
  updateMedication(id, data){ return this.put(`/medications/${id}`, data); },
  deleteMedication(id)      { return this.del(`/medications/${id}`); },
  logMedication(data)       { return this.post('/medications/logs', data); },
  updateMedLog(id, data)    { return this.put(`/medications/logs/${id}`, data); },

  // ── Notes ─────────────────────────────────────────────────
  getNotes(params={}) {
    if (typeof params === 'string') params = params ? { search: params } : {};
    return this.get('/notes?' + new URLSearchParams(params));
  },
  getNote(id)               { return this.get(`/notes/${id}`); },
  addNote(data)             { return this.post('/notes', data); },
  createNote(data)          { return this.addNote(data); },   // alias
  updateNote(id, data)      { return this.put(`/notes/${id}`, data); },
  deleteNote(id)            { return this.del(`/notes/${id}`); },

  // ── Stats ─────────────────────────────────────────────────
  getSummary()                 { return this.get('/stats/summary'); },
  getCycleHistory(params={})   { return this.get('/stats/cycle-history?' + new URLSearchParams(params)); },
  getSymptomsFreq(params={})   { return this.get('/stats/symptoms-frequency?' + new URLSearchParams(params)); },
  getMoodPatterns(params={})   { return this.get('/stats/mood-patterns?' + new URLSearchParams(params)); },
  getFlowAnalysis()            { return this.get('/stats/flow-analysis'); },
  getPredictions()             { return this.get('/stats/predictions'); },
  getCalendarData(year, month) { return this.get(`/stats/calendar-data?year=${year}&month=${month}`); },
  exportData()                 { return this.get('/stats/export'); },

  // ── Ovulation ─────────────────────────────────────────────
  getOvulation(params={})   { return this.get('/ovulation?' + new URLSearchParams(params)); },
  logOvulation(data)        { return this.post('/ovulation', data); },
  updateOvulation(id, data) { return this.put(`/ovulation/${id}`, data); },
  deleteOvulation(id)       { return this.del(`/ovulation/${id}`); },
  // ── Food logs ───────────────────────────────────────────────
  getFoodLogs(params={})     { return this.get('/food?' + new URLSearchParams(params)); },
  addFoodLog(data)           { return this.post('/food', data); },
  updateFoodLog(id, data)    { return this.put(`/food/${id}`, data); },
  deleteFoodLog(id)          { return this.del(`/food/${id}`); },

  // ── AI Analysis (DeepSeek) ─────────────────────────────────────
  analyzeAI(payload)         { return this.post('/ai/analyze', payload); },
  getAIHistory()             { return this.get('/ai/history'); },};

window.API = API;
