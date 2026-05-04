const express = require('express');
const db   = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ── Helpers ────────────────────────────────────────────────
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysDiff(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function calcPredictions(user, cycles) {
  if (!cycles || cycles.length === 0) return null;

  const completedCycles = cycles.filter(c => c.cycle_length != null);
  let avgCycleLen  = user.average_cycle_length || 28;
  let avgPeriodLen = user.average_period_length || 5;

  if (completedCycles.length >= 2) {
    const last6 = completedCycles.slice(0, 6);
    avgCycleLen = Math.round(last6.reduce((s, c) => s + c.cycle_length, 0) / last6.length);
  }
  if (completedCycles.length >= 2) {
    const withPeriod = completedCycles.filter(c => c.period_length != null).slice(0, 6);
    if (withPeriod.length > 0) {
      avgPeriodLen = Math.round(withPeriod.reduce((s, c) => s + c.period_length, 0) / withPeriod.length);
    }
  }

  const lastCycle   = cycles[0];
  const today       = new Date().toISOString().split('T')[0];
  const currentDay  = daysDiff(today, lastCycle.start_date) + 1;

  const nextPeriodStart = addDays(lastCycle.start_date, avgCycleLen);
  const ovulationDay    = addDays(nextPeriodStart, -14);
  const fertileStart    = addDays(ovulationDay, -5);
  const fertileEnd      = addDays(ovulationDay, 1);
  const daysUntilPeriod = daysDiff(nextPeriodStart, today);

  // Fase del ciclo
  let phase = 'folicular';
  if (currentDay <= avgPeriodLen)                            phase = 'menstrual';
  else if (currentDay >= avgCycleLen - 14 - 5 &&
           currentDay <= avgCycleLen - 14 + 1)               phase = 'fertil';
  else if (currentDay === avgCycleLen - 14)                  phase = 'ovulacion';
  else if (currentDay > avgCycleLen - 14 + 1)               phase = 'lutea';

  return {
    avgCycleLen, avgPeriodLen, currentCycleDay: currentDay,
    nextPeriodStart, ovulationDay, fertileStart, fertileEnd,
    daysUntilPeriod, phase,
    lastPeriodStart: lastCycle.start_date,
  };
}

// ── GET /api/stats/summary ────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const [userRes, cyclesRes, symptomsRes, moodsRes] = await Promise.all([
      db.query(`SELECT average_cycle_length, average_period_length, last_period_start
                FROM users WHERE id = $1`, [req.user.id]),
      db.query(`SELECT * FROM cycles WHERE user_id = $1 ORDER BY start_date DESC LIMIT 12`, [req.user.id]),
      db.query(`SELECT COUNT(*) as total FROM symptoms WHERE user_id = $1`, [req.user.id]),
      db.query(`SELECT COUNT(*) as total FROM moods WHERE user_id = $1`, [req.user.id]),
    ]);

    const user   = userRes.rows[0];
    const cycles = cyclesRes.rows;
    const predictions = calcPredictions(user, cycles);

    // Regularidad (desviación estándar del ciclo)
    const completedCycles = cycles.filter(c => c.cycle_length != null);
    let regularity = null;
    if (completedCycles.length >= 3) {
      const lengths = completedCycles.map(c => c.cycle_length);
      const avg = lengths.reduce((s, v) => s + v, 0) / lengths.length;
      const variance = lengths.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / lengths.length;
      const stdDev = Math.sqrt(variance);
      regularity = stdDev <= 3 ? 'regular' : stdDev <= 7 ? 'irregular' : 'muy_irregular';
    }

    res.json({
      predictions,
      totalCycles: cycles.length,
      totalSymptomEntries: parseInt(symptomsRes.rows[0].total),
      totalMoodEntries: parseInt(moodsRes.rows[0].total),
      regularity,
      cyclesTracked: completedCycles.length,
    });
  } catch (err) {
    console.error('[stats summary]', err);
    res.status(500).json({ error: 'Error al calcular estadísticas.' });
  }
});

// ── GET /api/stats/cycle-history ──────────────────────────
router.get('/cycle-history', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 12, 24);
  try {
    const result = await db.query(
      `SELECT id, start_date, end_date, cycle_length, period_length
       FROM cycles WHERE user_id = $1
       ORDER BY start_date DESC LIMIT $2`,
      [req.user.id, limit]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    console.error('[stats cycle-history]', err);
    res.status(500).json({ error: 'Error.' });
  }
});

// ── GET /api/stats/symptoms-frequency ────────────────────
router.get('/symptoms-frequency', async (req, res) => {
  const months = Math.min(parseInt(req.query.months) || 6, 12);
  const since  = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().split('T')[0];

  try {
    const result = await db.query(
      `SELECT symptom_type,
              COUNT(*) as count,
              ROUND(AVG(severity), 1) as avg_severity
       FROM symptoms
       WHERE user_id = $1 AND date >= $2
       GROUP BY symptom_type
       ORDER BY count DESC
       LIMIT 15`,
      [req.user.id, sinceStr]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[stats symptoms-frequency]', err);
    res.status(500).json({ error: 'Error.' });
  }
});

// ── GET /api/stats/mood-patterns ─────────────────────────
router.get('/mood-patterns', async (req, res) => {
  const months = Math.min(parseInt(req.query.months) || 3, 12);
  const since  = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().split('T')[0];

  try {
    const result = await db.query(
      `SELECT mood, COUNT(*) as count, ROUND(AVG(energy_level), 1) as avg_energy
       FROM moods
       WHERE user_id = $1 AND date >= $2
       GROUP BY mood
       ORDER BY count DESC`,
      [req.user.id, sinceStr]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[stats mood-patterns]', err);
    res.status(500).json({ error: 'Error.' });
  }
});

// ── GET /api/stats/flow-analysis ─────────────────────────
router.get('/flow-analysis', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT flow_intensity, COUNT(*) as count
       FROM period_days
       WHERE user_id = $1
       GROUP BY flow_intensity
       ORDER BY CASE flow_intensity
         WHEN 'very_heavy' THEN 1 WHEN 'heavy' THEN 2 WHEN 'medium' THEN 3
         WHEN 'light' THEN 4 WHEN 'spotting' THEN 5 END`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[stats flow-analysis]', err);
    res.status(500).json({ error: 'Error.' });
  }
});

// ── GET /api/stats/predictions ────────────────────────────
router.get('/predictions', async (req, res) => {
  try {
    const userRes   = await db.query(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
    const cyclesRes = await db.query(
      `SELECT * FROM cycles WHERE user_id = $1 ORDER BY start_date DESC LIMIT 12`,
      [req.user.id]
    );
    const user       = userRes.rows[0];
    const cycles     = cyclesRes.rows;
    const predictions = calcPredictions(user, cycles);

    if (!predictions) return res.json({ message: 'No hay ciclos registrados aún.' });

    // Generar próximos 3 periodos predichos
    const upcoming = [];
    for (let i = 1; i <= 3; i++) {
      const start = addDays(predictions.nextPeriodStart, predictions.avgCycleLen * (i - 1));
      const end   = addDays(start, predictions.avgPeriodLen - 1);
      const ovul  = addDays(addDays(start, predictions.avgCycleLen), -14);
      upcoming.push({ periodStart: start, periodEnd: end, ovulationDay: ovul, cycleNumber: i });
    }

    res.json({ ...predictions, upcomingCycles: upcoming });
  } catch (err) {
    console.error('[stats predictions]', err);
    res.status(500).json({ error: 'Error al calcular predicciones.' });
  }
});

// ── GET /api/stats/calendar-data ──────────────────────────
// Devuelve todos los datos necesarios para renderizar el calendario
router.get('/calendar-data', async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year y month requeridos.' });

  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const d     = new Date(year, month, 0);
  const end   = `${year}-${String(month).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  try {
    const [userRes, cyclesRes, periodDaysRes, symptomsRes, moodsRes, ovulationRes] = await Promise.all([
      db.query('SELECT * FROM users WHERE id = $1', [req.user.id]),
      db.query('SELECT * FROM cycles WHERE user_id = $1 ORDER BY start_date DESC LIMIT 6', [req.user.id]),
      db.query('SELECT * FROM period_days WHERE user_id = $1 AND date BETWEEN $2 AND $3', [req.user.id, start, end]),
      db.query('SELECT date, symptom_type, severity FROM symptoms WHERE user_id = $1 AND date BETWEEN $2 AND $3', [req.user.id, start, end]),
      db.query('SELECT date, mood, energy_level FROM moods WHERE user_id = $1 AND date BETWEEN $2 AND $3', [req.user.id, start, end]),
      db.query('SELECT date, lh_test FROM ovulation_tracking WHERE user_id = $1 AND date BETWEEN $2 AND $3', [req.user.id, start, end]),
    ]);

    const user       = userRes.rows[0];
    const cycles     = cyclesRes.rows;
    const predictions = calcPredictions(user, cycles);

    res.json({
      periodDays:  periodDaysRes.rows,
      symptoms:    symptomsRes.rows,
      moods:       moodsRes.rows,
      ovulation:   ovulationRes.rows,
      predictions,
    });
  } catch (err) {
    console.error('[stats calendar-data]', err);
    res.status(500).json({ error: 'Error al cargar datos del calendario.' });
  }
});

// ── GET /api/stats/export ─────────────────────────────────
// Exportar todos los datos del usuario como JSON
router.get('/export', async (req, res) => {
  try {
    const [cycles, periodDays, symptoms, moods, notes, medications, ovulation] = await Promise.all([
      db.query('SELECT * FROM cycles WHERE user_id = $1 ORDER BY start_date', [req.user.id]),
      db.query('SELECT * FROM period_days WHERE user_id = $1 ORDER BY date', [req.user.id]),
      db.query('SELECT * FROM symptoms WHERE user_id = $1 ORDER BY date', [req.user.id]),
      db.query('SELECT * FROM moods WHERE user_id = $1 ORDER BY date', [req.user.id]),
      db.query('SELECT id, date, title, content, tags FROM notes WHERE user_id = $1 ORDER BY date', [req.user.id]),
      db.query('SELECT id, name, dose, frequency, notes FROM medications WHERE user_id = $1', [req.user.id]),
      db.query('SELECT * FROM ovulation_tracking WHERE user_id = $1 ORDER BY date', [req.user.id]),
    ]);

    res.json({
      exportDate: new Date().toISOString(),
      data: {
        cycles:      cycles.rows,
        periodDays:  periodDays.rows,
        symptoms:    symptoms.rows,
        moods:       moods.rows,
        notes:       notes.rows,
        medications: medications.rows,
        ovulation:   ovulation.rows,
      }
    });
  } catch (err) {
    console.error('[stats export]', err);
    res.status(500).json({ error: 'Error al exportar datos.' });
  }
});

module.exports = router;
