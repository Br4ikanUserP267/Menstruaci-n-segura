const express = require('express');
const { body, validationResult } = require('express-validator');
const db   = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ── GET /api/medications ──────────────────────────────────
router.get('/', async (req, res) => {
  const { active } = req.query;
  try {
    let q = 'SELECT * FROM medications WHERE user_id = $1';
    const params = [req.user.id];
    if (active !== undefined) { params.push(active === 'true'); q += ` AND active = $${params.length}`; }
    q += ' ORDER BY name ASC';
    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[medications GET]', err);
    res.status(500).json({ error: 'Error al obtener medicamentos.' });
  }
});

// ── GET /api/medications/today ────────────────────────────
router.get('/today', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    // Obtener medicamentos activos con sus logs de hoy
    const result = await db.query(
      `SELECT m.*,
              json_agg(
                json_build_object(
                  'log_id', ml.id,
                  'scheduled_time', ml.scheduled_time,
                  'status', ml.status,
                  'taken_at', ml.taken_at
                ) ORDER BY ml.scheduled_time
              ) FILTER (WHERE ml.id IS NOT NULL) AS today_logs
       FROM medications m
       LEFT JOIN medication_logs ml
         ON ml.medication_id = m.id AND ml.scheduled_date = $2
       WHERE m.user_id = $1 AND m.active = TRUE
       GROUP BY m.id
       ORDER BY m.name`,
      [req.user.id, today]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[medications today]', err);
    res.status(500).json({ error: 'Error al obtener medicamentos de hoy.' });
  }
});

// ── GET /api/medications/logs ─────────────────────────────
router.get('/logs', async (req, res) => {
  const { start, end, medication_id } = req.query;
  try {
    let q = `SELECT ml.*, m.name as medication_name, m.dose, m.color
             FROM medication_logs ml
             JOIN medications m ON m.id = ml.medication_id
             WHERE ml.user_id = $1`;
    const params = [req.user.id];
    if (medication_id) { params.push(medication_id); q += ` AND ml.medication_id = $${params.length}`; }
    if (start) { params.push(start); q += ` AND ml.scheduled_date >= $${params.length}`; }
    if (end)   { params.push(end);   q += ` AND ml.scheduled_date <= $${params.length}`; }
    q += ' ORDER BY ml.scheduled_date DESC, ml.scheduled_time';

    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[med logs GET]', err);
    res.status(500).json({ error: 'Error al obtener registros.' });
  }
});

// ── POST /api/medications ─────────────────────────────────
router.post('/', [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Nombre requerido.'),
  body('dose').optional().isString().isLength({ max: 50 }),
  body('frequency').isIn(['daily','weekly','monthly','as_needed','cycle_only']).withMessage('Frecuencia no válida.'),
  body('reminder_times').optional().isArray(),
  body('notes').optional().isString().isLength({ max: 500 }),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color hexadecimal inválido.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, dose, frequency, reminder_times, notes, color } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO medications (user_id, name, dose, frequency, reminder_times, notes, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, name, dose || null, frequency, reminder_times || [], notes || null, color || '#C2185B']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[medications POST]', err);
    res.status(500).json({ error: 'Error al crear medicamento.' });
  }
});

// ── PUT /api/medications/:id ──────────────────────────────
router.put('/:id', [
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('dose').optional().isString().isLength({ max: 50 }),
  body('frequency').optional().isIn(['daily','weekly','monthly','as_needed','cycle_only']),
  body('reminder_times').optional().isArray(),
  body('active').optional().isBoolean(),
  body('notes').optional().isString().isLength({ max: 500 }),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const fields = ['name','dose','frequency','reminder_times','active','notes','color'];
  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Sin campos a actualizar.' });

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 3}`).join(', ');
  const values = [req.params.id, req.user.id, ...Object.values(updates)];

  try {
    const result = await db.query(
      `UPDATE medications SET ${setClauses}, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Medicamento no encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[medications PUT]', err);
    res.status(500).json({ error: 'Error al actualizar medicamento.' });
  }
});

// ── DELETE /api/medications/:id ───────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM medications WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Medicamento no encontrado.' });
    res.json({ message: 'Medicamento eliminado.' });
  } catch (err) {
    console.error('[medications DELETE]', err);
    res.status(500).json({ error: 'Error al eliminar medicamento.' });
  }
});

// ── POST /api/medications/logs ────────────────────────────
router.post('/logs', [
  body('medication_id').isInt().withMessage('ID de medicamento requerido.'),
  body('scheduled_date').isISO8601().withMessage('Fecha inválida.'),
  body('scheduled_time').optional().matches(/^\d{2}:\d{2}$/),
  body('status').isIn(['pending','taken','skipped']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { medication_id, scheduled_date, scheduled_time, status, notes } = req.body;

  try {
    // Verificar que el medicamento pertenece al usuario
    const own = await db.query('SELECT id FROM medications WHERE id = $1 AND user_id = $2', [medication_id, req.user.id]);
    if (own.rows.length === 0) return res.status(404).json({ error: 'Medicamento no encontrado.' });

    const taken_at = status === 'taken' ? new Date().toISOString() : null;

    const result = await db.query(
      `INSERT INTO medication_logs (user_id, medication_id, scheduled_date, scheduled_time, status, taken_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [req.user.id, medication_id, scheduled_date, scheduled_time || null, status, taken_at, notes || null]
    );
    res.status(201).json(result.rows[0] || { message: 'Log ya existente.' });
  } catch (err) {
    console.error('[med logs POST]', err);
    res.status(500).json({ error: 'Error al registrar toma.' });
  }
});

// ── PUT /api/medications/logs/:id ─────────────────────────
router.put('/logs/:id', [
  body('status').isIn(['pending','taken','skipped']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { status, notes } = req.body;
  const taken_at = status === 'taken' ? new Date().toISOString() : null;

  try {
    const result = await db.query(
      `UPDATE medication_logs
       SET status = $1, taken_at = $2, notes = COALESCE($3, notes)
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [status, taken_at, notes || null, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[med logs PUT]', err);
    res.status(500).json({ error: 'Error al actualizar registro.' });
  }
});

module.exports = router;
