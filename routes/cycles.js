const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db   = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ── GET /api/cycles  - Listar ciclos del usuario ───────────
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 24, 120);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const result = await db.query(
      `SELECT * FROM cycles
       WHERE user_id = $1
       ORDER BY start_date DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[cycles GET]', err);
    res.status(500).json({ error: 'Error al obtener ciclos.' });
  }
});

// ── GET /api/cycles/current  - Ciclo activo actualmente ───
router.get('/current', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM cycles
       WHERE user_id = $1
       ORDER BY start_date DESC
       LIMIT 1`,
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('[cycles current]', err);
    res.status(500).json({ error: 'Error al obtener ciclo actual.' });
  }
});

// ── GET /api/cycles/period-days  - Días de menstruación ───
router.get('/period-days', async (req, res) => {
  const { start, end } = req.query;
  try {
    let q = 'SELECT * FROM period_days WHERE user_id = $1';
    const params = [req.user.id];
    if (start) { params.push(start); q += ` AND date >= $${params.length}`; }
    if (end)   { params.push(end);   q += ` AND date <= $${params.length}`; }
    q += ' ORDER BY date DESC';

    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[period-days GET]', err);
    res.status(500).json({ error: 'Error al obtener días de menstruación.' });
  }
});

// ── POST /api/cycles  - Iniciar nuevo ciclo ────────────────
router.post('/', [
  body('start_date').isISO8601().withMessage('Fecha de inicio inválida.'),
  body('notes').optional().isString().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { start_date, notes } = req.body;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Cerrar ciclo anterior (si no tiene end_date calculada)
    const prev = await client.query(
      `SELECT id, start_date FROM cycles
       WHERE user_id = $1 AND cycle_length IS NULL
       ORDER BY start_date DESC LIMIT 1`,
      [req.user.id]
    );

    if (prev.rows.length > 0) {
      const prevCycle = prev.rows[0];
      const startNew  = new Date(start_date);
      const startPrev = new Date(prevCycle.start_date);
      const cycleLen  = Math.round((startNew - startPrev) / (1000 * 60 * 60 * 24));

      await client.query(
        `UPDATE cycles SET cycle_length = $1 WHERE id = $2`,
        [cycleLen, prevCycle.id]
      );
      await client.query(
        `UPDATE users SET average_cycle_length = (
           SELECT ROUND(AVG(cycle_length)) FROM cycles
           WHERE user_id = $1 AND cycle_length IS NOT NULL
         ) WHERE id = $1`,
        [req.user.id]
      );
    }

    // Crear nuevo ciclo
    const result = await client.query(
      `INSERT INTO cycles (user_id, start_date, notes)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.id, start_date, notes || null]
    );

    // Actualizar last_period_start en el usuario
    await client.query(
      `UPDATE users SET last_period_start = $1 WHERE id = $2`,
      [start_date, req.user.id]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un ciclo con esa fecha de inicio.' });
    console.error('[cycles POST]', err);
    res.status(500).json({ error: 'Error al crear el ciclo.' });
  } finally {
    client.release();
  }
});

// ── PUT /api/cycles/:id ────────────────────────────────────
router.put('/:id', [
  body('end_date').optional().isISO8601(),
  body('notes').optional().isString().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { id } = req.params;
  const { end_date, notes } = req.body;

  try {
    const own = await db.query('SELECT id FROM cycles WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (own.rows.length === 0) return res.status(404).json({ error: 'Ciclo no encontrado.' });

    const result = await db.query(
      `UPDATE cycles SET end_date = COALESCE($1, end_date), notes = COALESCE($2, notes), updated_at = NOW()
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [end_date || null, notes || null, id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[cycles PUT]', err);
    res.status(500).json({ error: 'Error al actualizar el ciclo.' });
  }
});

// ── DELETE /api/cycles/:id ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM cycles WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Ciclo no encontrado.' });
    res.json({ message: 'Ciclo eliminado.' });
  } catch (err) {
    console.error('[cycles DELETE]', err);
    res.status(500).json({ error: 'Error al eliminar el ciclo.' });
  }
});

// ── POST /api/cycles/period-day  - Registrar día de sangrado
router.post('/period-day', [
  body('date').isISO8601().withMessage('Fecha inválida.'),
  body('flow_intensity')
    .isIn(['spotting','light','medium','heavy','very_heavy'])
    .withMessage('Intensidad no válida.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { date, flow_intensity } = req.body;

  try {
    // Buscar ciclo correspondiente
    const cycleRes = await db.query(
      `SELECT id FROM cycles
       WHERE user_id = $1 AND start_date <= $2
       ORDER BY start_date DESC LIMIT 1`,
      [req.user.id, date]
    );
    const cycle_id = cycleRes.rows.length > 0 ? cycleRes.rows[0].id : null;

    const result = await db.query(
      `INSERT INTO period_days (user_id, cycle_id, date, flow_intensity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, date)
       DO UPDATE SET flow_intensity = EXCLUDED.flow_intensity, cycle_id = EXCLUDED.cycle_id
       RETURNING *`,
      [req.user.id, cycle_id, date, flow_intensity]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[period-day POST]', err);
    res.status(500).json({ error: 'Error al registrar día de menstruación.' });
  }
});

// ── DELETE /api/cycles/period-day/:id ─────────────────────
router.delete('/period-day/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM period_days WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Día no encontrado.' });
    res.json({ message: 'Día de menstruación eliminado.' });
  } catch (err) {
    console.error('[period-day DELETE]', err);
    res.status(500).json({ error: 'Error al eliminar.' });
  }
});

module.exports = router;
