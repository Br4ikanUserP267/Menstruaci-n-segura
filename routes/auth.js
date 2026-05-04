const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db       = require('../db');
const auth     = require('../middleware/auth');

const router = express.Router();

// ── Validaciones ───────────────────────────────────────────
const registerRules = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('El usuario debe tener entre 3 y 50 caracteres.')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('El usuario solo puede contener letras, números y guiones bajos.'),
  body('password')
    .isLength({ min: 6, max: 100 })
    .withMessage('La contraseña debe tener al menos 6 caracteres.'),
];

// ── POST /api/auth/register ────────────────────────────────
router.post('/register', registerRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;

  try {
    const exists = await db.query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'El nombre de usuario ya existe.' });
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const password_hash = await bcrypt.hash(password, rounds);

    const result = await db.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, average_cycle_length, average_period_length,
                 last_period_start, onboarding_completed, created_at`,
      [username.toLowerCase(), password_hash]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Error al crear el usuario.' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Usuario requerido.'),
  body('password').notEmpty().withMessage('Contraseña requerida.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;

  try {
    const result = await db.query(
      `SELECT id, username, password_hash, average_cycle_length, average_period_length,
              last_period_start, birth_date, timezone, onboarding_completed, created_at
       FROM users WHERE username = $1`,
      [username.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, average_cycle_length, average_period_length,
              last_period_start, birth_date, timezone, onboarding_completed, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[me]', err);
    res.status(500).json({ error: 'Error al obtener el perfil.' });
  }
});

// ── PUT /api/auth/profile ──────────────────────────────────
router.put('/profile', auth, [
  body('average_cycle_length').optional().isInt({ min: 15, max: 60 }),
  body('average_period_length').optional().isInt({ min: 1, max: 15 }),
  body('last_period_start').optional().isISO8601(),
  body('birth_date').optional().isISO8601(),
  body('timezone').optional().isString().isLength({ max: 60 }),
  body('onboarding_completed').optional().isBoolean(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const fields = ['average_cycle_length', 'average_period_length', 'last_period_start',
                  'birth_date', 'timezone', 'onboarding_completed'];

  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar.' });
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values     = [req.user.id, ...Object.values(updates)];

  try {
    const result = await db.query(
      `UPDATE users SET ${setClauses}
       WHERE id = $1
       RETURNING id, username, average_cycle_length, average_period_length,
                 last_period_start, birth_date, timezone, onboarding_completed, updated_at`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[profile update]', err);
    res.status(500).json({ error: 'Error al actualizar el perfil.' });
  }
});

// ── PUT /api/auth/password ─────────────────────────────────
router.put('/password', auth, [
  body('current_password').notEmpty().withMessage('Contraseña actual requerida.'),
  body('new_password').isLength({ min: 6, max: 100 }).withMessage('La nueva contraseña debe tener al menos 6 caracteres.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { current_password, new_password } = req.body;

  try {
    const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta.' });

    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const newHash = await bcrypt.hash(new_password, rounds);

    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('[password]', err);
    res.status(500).json({ error: 'Error al cambiar la contraseña.' });
  }
});

module.exports = router;
