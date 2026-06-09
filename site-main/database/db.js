const { Pool } = require("pg");

const DB_POOL_MAX = Number(process.env.DB_POOL_MAX || 20);
const DB_POOL_IDLE_TIMEOUT_MS = Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30000);
const DB_POOL_CONNECTION_TIMEOUT_MS = Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || 5000);
const DB_STATEMENT_TIMEOUT_MS = Number(process.env.DB_STATEMENT_TIMEOUT_MS || 30000);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number.isFinite(DB_POOL_MAX) && DB_POOL_MAX > 0 ? DB_POOL_MAX : 20,
  idleTimeoutMillis: Number.isFinite(DB_POOL_IDLE_TIMEOUT_MS) && DB_POOL_IDLE_TIMEOUT_MS > 0 ? DB_POOL_IDLE_TIMEOUT_MS : 30000,
  connectionTimeoutMillis: Number.isFinite(DB_POOL_CONNECTION_TIMEOUT_MS) && DB_POOL_CONNECTION_TIMEOUT_MS > 0 ? DB_POOL_CONNECTION_TIMEOUT_MS : 5000,
  statement_timeout: Number.isFinite(DB_STATEMENT_TIMEOUT_MS) && DB_STATEMENT_TIMEOUT_MS > 0 ? DB_STATEMENT_TIMEOUT_MS : 30000
});

pool.on("error", (error) => {
  console.error("POSTGRES POOL ERROR:", error);
});

module.exports = pool;
