const express = require('express');
const { body, validationResult } = require('express-validator');
const db   = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const VALID_MOODS = [
  'muy_bien','bien','neutral','mal','muy_mal',
  'ansiosa','irritable','triste','feliz',
  'energica','cansada','sensible','romantica'
];

// ── GET /api/moods ────────────────────────────────────────
router.get('/', async (req, res) => {
  const { start, end, date } = req.query;
  try {
    let q = 'SELECT * FROM moods WHERE user_id = $1';
    const params = [req.user.id];
    if (date)  { params.push(date);  q += ` AND date = $${params.length}`; }
    if (start) { params.push(start); q += ` AND date >= $${params.length}`; }
    if (end)   { params.push(end);   q += ` AND date <= $${params.length}`; }
    q += ' ORDER BY date DESC';
    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[moods GET]', err);
    res.status(500).json({ error: 'Error al obtener estados de ánimo.' });
  }
});

// ── POST /api/moods ───────────────────────────────────────
router.post('/', [
  body('date').isISO8601().withMessage('Fecha inválida.'),
  body('mood').isIn(VALID_MOODS).withMessage('Estado de ánimo no válido.'),
  body('energy_level').optional().isInt({ min: 1, max: 5 }),
  body('notes').optional().isString().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { date, mood, energy_level, notes } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO moods (user_id, date, mood, energy_level, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, date)
       DO UPDATE SET mood = EXCLUDED.mood, energy_level = EXCLUDED.energy_level, notes = EXCLUDED.notes, updated_at = NOW()
       RETURNING *`,
      [req.user.id, date, mood, energy_level || 3, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[moods POST]', err);
    res.status(500).json({ error: 'Error al registrar estado de ánimo.' });
  }
});

// ── PUT /api/moods/:id ────────────────────────────────────
router.put('/:id', [
  body('mood').optional().isIn(VALID_MOODS),
  body('energy_level').optional().isInt({ min: 1, max: 5 }),
  body('notes').optional().isString().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { mood, energy_level, notes } = req.body;
  try {
    const result = await db.query(
      `UPDATE moods
       SET mood = COALESCE($1, mood),
           energy_level = COALESCE($2, energy_level),
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [mood || null, energy_level || null, notes !== undefined ? notes : null, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[moods PUT]', err);
    res.status(500).json({ error: 'Error al actualizar estado de ánimo.' });
  }
});

// ── DELETE /api/moods/:id ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM moods WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json({ message: 'Estado de ánimo eliminado.' });
  } catch (err) {
    console.error('[moods DELETE]', err);
    res.status(500).json({ error: 'Error al eliminar.' });
  }
});

module.exports = router;
