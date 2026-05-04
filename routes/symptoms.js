const express = require('express');
const { body, validationResult } = require('express-validator');
const db   = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ── GET /api/symptoms  - Listar síntomas ──────────────────
router.get('/', async (req, res) => {
  const { start, end, date } = req.query;
  try {
    let q = 'SELECT * FROM symptoms WHERE user_id = $1';
    const params = [req.user.id];
    if (date)  { params.push(date);  q += ` AND date = $${params.length}`; }
    if (start) { params.push(start); q += ` AND date >= $${params.length}`; }
    if (end)   { params.push(end);   q += ` AND date <= $${params.length}`; }
    q += ' ORDER BY date DESC, created_at DESC';

    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[symptoms GET]', err);
    res.status(500).json({ error: 'Error al obtener síntomas.' });
  }
});

// ── GET /api/symptoms/catalog ─────────────────────────────
router.get('/catalog', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM symptom_catalog ORDER BY category, name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[symptoms catalog]', err);
    res.status(500).json({ error: 'Error al obtener catálogo.' });
  }
});

// ── POST /api/symptoms ────────────────────────────────────
router.post('/', [
  body('date').isISO8601().withMessage('Fecha inválida.'),
  body('symptom_type').trim().isLength({ min: 1, max: 100 }).withMessage('Tipo de síntoma requerido.'),
  body('severity').isInt({ min: 1, max: 5 }).withMessage('Severidad debe ser entre 1 y 5.'),
  body('notes').optional().isString().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { date, symptom_type, severity, notes } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO symptoms (user_id, date, symptom_type, severity, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, date, symptom_type, severity, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[symptoms POST]', err);
    res.status(500).json({ error: 'Error al registrar síntoma.' });
  }
});

// ── PUT /api/symptoms/:id ─────────────────────────────────
router.put('/:id', [
  body('severity').optional().isInt({ min: 1, max: 5 }),
  body('notes').optional().isString().isLength({ max: 500 }),
  body('symptom_type').optional().trim().isLength({ min: 1, max: 100 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { severity, notes, symptom_type } = req.body;
  try {
    const result = await db.query(
      `UPDATE symptoms
       SET symptom_type = COALESCE($1, symptom_type),
           severity = COALESCE($2, severity),
           notes = COALESCE($3, notes)
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [symptom_type || null, severity || null, notes !== undefined ? notes : null, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Síntoma no encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[symptoms PUT]', err);
    res.status(500).json({ error: 'Error al actualizar síntoma.' });
  }
});

// ── DELETE /api/symptoms/:id ──────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM symptoms WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Síntoma no encontrado.' });
    res.json({ message: 'Síntoma eliminado.' });
  } catch (err) {
    console.error('[symptoms DELETE]', err);
    res.status(500).json({ error: 'Error al eliminar síntoma.' });
  }
});

module.exports = router;
