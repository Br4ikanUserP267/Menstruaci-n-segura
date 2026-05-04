const express = require('express');
const { body, validationResult } = require('express-validator');
const db   = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ── GET /api/notes ────────────────────────────────────────
router.get('/', async (req, res) => {
  const { start, end, date, search } = req.query;
  try {
    let q = 'SELECT * FROM notes WHERE user_id = $1';
    const params = [req.user.id];

    if (date)  { params.push(date);  q += ` AND date = $${params.length}`; }
    if (start) { params.push(start); q += ` AND date >= $${params.length}`; }
    if (end)   { params.push(end);   q += ` AND date <= $${params.length}`; }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      q += ` AND (LOWER(title) LIKE $${params.length} OR LOWER(content) LIKE $${params.length})`;
    }

    q += ' ORDER BY date DESC, created_at DESC';
    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[notes GET]', err);
    res.status(500).json({ error: 'Error al obtener notas.' });
  }
});

// ── GET /api/notes/:id ────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Nota no encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[notes GET id]', err);
    res.status(500).json({ error: 'Error al obtener la nota.' });
  }
});

// ── POST /api/notes ───────────────────────────────────────
router.post('/', [
  body('date').isISO8601().withMessage('Fecha inválida.'),
  body('content').trim().isLength({ min: 1, max: 5000 }).withMessage('El contenido es requerido.'),
  body('title').optional().trim().isLength({ max: 200 }),
  body('tags').optional().isArray(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { date, title, content, tags } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO notes (user_id, date, title, content, tags)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, date, title || null, content, tags || []]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[notes POST]', err);
    res.status(500).json({ error: 'Error al crear la nota.' });
  }
});

// ── PUT /api/notes/:id ────────────────────────────────────
router.put('/:id', [
  body('title').optional().trim().isLength({ max: 200 }),
  body('content').optional().trim().isLength({ min: 1, max: 5000 }),
  body('tags').optional().isArray(),
  body('date').optional().isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, content, tags, date } = req.body;
  try {
    const result = await db.query(
      `UPDATE notes
       SET title   = COALESCE($1, title),
           content = COALESCE($2, content),
           tags    = COALESCE($3, tags),
           date    = COALESCE($4, date),
           updated_at = NOW()
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [title !== undefined ? title : null, content || null, tags || null, date || null, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Nota no encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[notes PUT]', err);
    res.status(500).json({ error: 'Error al actualizar la nota.' });
  }
});

// ── DELETE /api/notes/:id ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Nota no encontrada.' });
    res.json({ message: 'Nota eliminada.' });
  } catch (err) {
    console.error('[notes DELETE]', err);
    res.status(500).json({ error: 'Error al eliminar la nota.' });
  }
});

module.exports = router;
