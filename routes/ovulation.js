const express = require('express');
const { body, validationResult } = require('express-validator');
const db   = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ── GET /api/ovulation ────────────────────────────────────
router.get('/', async (req, res) => {
  const { start, end } = req.query;
  try {
    let q = 'SELECT * FROM ovulation_tracking WHERE user_id = $1';
    const params = [req.user.id];
    if (start) { params.push(start); q += ` AND date >= $${params.length}`; }
    if (end)   { params.push(end);   q += ` AND date <= $${params.length}`; }
    q += ' ORDER BY date DESC';
    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[ovulation GET]', err);
    res.status(500).json({ error: 'Error al obtener datos de ovulación.' });
  }
});

// ── POST /api/ovulation ───────────────────────────────────
router.post('/', [
  body('date').isISO8601().withMessage('Fecha inválida.'),
  body('cervical_mucus').optional().isIn(['seco','cremoso','acuoso','elastico','sin_observacion']),
  body('bbt').optional().isFloat({ min: 35.0, max: 42.0 }).withMessage('Temperatura fuera de rango (35-42°C).'),
  body('lh_test').optional().isIn(['negativo','positivo','pico']),
  body('libido').optional().isInt({ min: 1, max: 5 }),
  body('notes').optional().isString().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { date, cervical_mucus, bbt, lh_test, libido, notes } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO ovulation_tracking (user_id, date, cervical_mucus, bbt, lh_test, libido, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, date)
       DO UPDATE SET
         cervical_mucus = COALESCE(EXCLUDED.cervical_mucus, ovulation_tracking.cervical_mucus),
         bbt = COALESCE(EXCLUDED.bbt, ovulation_tracking.bbt),
         lh_test = COALESCE(EXCLUDED.lh_test, ovulation_tracking.lh_test),
         libido = COALESCE(EXCLUDED.libido, ovulation_tracking.libido),
         notes = COALESCE(EXCLUDED.notes, ovulation_tracking.notes)
       RETURNING *`,
      [req.user.id, date, cervical_mucus || null, bbt || null, lh_test || null, libido || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[ovulation POST]', err);
    res.status(500).json({ error: 'Error al registrar datos de ovulación.' });
  }
});

// ── PUT /api/ovulation/:id ────────────────────────────────
router.put('/:id', [
  body('cervical_mucus').optional().isIn(['seco','cremoso','acuoso','elastico','sin_observacion']),
  body('bbt').optional().isFloat({ min: 35.0, max: 42.0 }),
  body('lh_test').optional().isIn(['negativo','positivo','pico']),
  body('libido').optional().isInt({ min: 1, max: 5 }),
  body('notes').optional().isString().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { cervical_mucus, bbt, lh_test, libido, notes } = req.body;
  try {
    const result = await db.query(
      `UPDATE ovulation_tracking
       SET cervical_mucus = COALESCE($1, cervical_mucus),
           bbt = COALESCE($2, bbt),
           lh_test = COALESCE($3, lh_test),
           libido = COALESCE($4, libido),
           notes = COALESCE($5, notes)
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [cervical_mucus || null, bbt || null, lh_test || null, libido || null,
       notes !== undefined ? notes : null, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[ovulation PUT]', err);
    res.status(500).json({ error: 'Error al actualizar datos de ovulación.' });
  }
});

// ── DELETE /api/ovulation/:id ─────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM ovulation_tracking WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json({ message: 'Registro eliminado.' });
  } catch (err) {
    console.error('[ovulation DELETE]', err);
    res.status(500).json({ error: 'Error al eliminar.' });
  }
});

module.exports = router;
