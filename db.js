require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en cliente PostgreSQL:', err);
  process.exit(-1);
});

// Helper: ejecutar query con cliente del pool
const query = (text, params) => pool.query(text, params);

// Helper: obtener cliente para transacciones
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
