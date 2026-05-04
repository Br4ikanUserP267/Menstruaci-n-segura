require('dotenv').config();
const express = require('express');
const path    = require('path');
const helmet  = require('helmet');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');

// Rutas
const authRoutes        = require('./routes/auth');
const cyclesRoutes      = require('./routes/cycles');
const symptomsRoutes    = require('./routes/symptoms');
const moodsRoutes       = require('./routes/moods');
const medicationsRoutes = require('./routes/medications');
const notesRoutes       = require('./routes/notes');
const statsRoutes       = require('./routes/stats');
const ovulationRoutes   = require('./routes/ovulation');
const foodRoutes        = require('./routes/food');
const aiRoutes          = require('./routes/ai');

const app = express();

// ── Seguridad ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc:     ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ──────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta más tarde.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de autenticación.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Parsers ────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Archivos estáticos ─────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Rutas API ──────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/cycles',      cyclesRoutes);
app.use('/api/symptoms',    symptomsRoutes);
app.use('/api/moods',       moodsRoutes);
app.use('/api/medications', medicationsRoutes);
app.use('/api/notes',       notesRoutes);
app.use('/api/stats',       statsRoutes);
app.use('/api/ovulation',   ovulationRoutes);
app.use('/api/food',        foodRoutes);
app.use('/api/ai',          aiRoutes);

// ── Health check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Luna', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ── SPA fallback ───────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ── Manejo global de errores ───────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message, err.stack);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor.' : err.message,
  });
});

// ── Arranque ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌙 Luna corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
