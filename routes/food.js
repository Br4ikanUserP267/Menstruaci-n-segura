/* ============================================================
   routes/food.js — Registro de alimentos
   ============================================================ */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// ── GET /api/food  (lista, filtrar por date o rango) ────────
router.get('/', async (req, res) => {
  const { date, start, end } = req.query;
  let q = 'SELECT * FROM food_logs WHERE user_id = $1';
  const params = [req.user.id];

  if (date) {
    q += ` AND date = $${params.length + 1}`;
    params.push(date);
  } else if (start && end) {
    q += ` AND date BETWEEN $${params.length + 1} AND $${params.length + 2}`;
    params.push(start, end);
  }
  q += ' ORDER BY date DESC, meal_type';

  const { rows } = await db.query(q, params);
  res.json(rows);
});

// ── POST /api/food ──────────────────────────────────────────
router.post('/', [
  body('date').isDate(),
  body('meal_type').optional().isIn(['desayuno','almuerzo','cena','snack','other']),
  body('foods').optional().isArray(),
  body('notes').optional().isString().trim(),
], validate, async (req, res) => {
  const { date, meal_type = 'other', foods = [], notes } = req.body;

  const { rows } = await db.query(
    `INSERT INTO food_logs (user_id, date, meal_type, foods, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [req.user.id, date, meal_type, foods, notes || null]
  );
  res.status(201).json(rows[0]);
});

// ── PUT /api/food/:id ───────────────────────────────────────
router.put('/:id', [
  body('foods').optional().isArray(),
  body('meal_type').optional().isIn(['desayuno','almuerzo','cena','snack','other']),
  body('notes').optional().isString().trim(),
], validate, async (req, res) => {
  const { meal_type, foods, notes } = req.body;

  const { rows } = await db.query(
    `UPDATE food_logs
     SET meal_type = COALESCE($1, meal_type),
         foods     = COALESCE($2, foods),
         notes     = COALESCE($3, notes)
     WHERE id = $4 AND user_id = $5
     RETURNING *`,
    [meal_type || null, foods || null, notes ?? null, req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json(rows[0]);
});

// ── DELETE /api/food/:id ────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM food_logs WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json({ message: 'Eliminado.' });
});

module.exports = router;
