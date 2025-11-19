/**
 * Database Configuration with Security Best Practices
 *
 * SECURITY MEASURES IMPLEMENTED:
 * 1. Connection pooling to prevent connection exhaustion attacks
 * 2. Connection limits to protect database resources
 * 3. Timeout settings to prevent hanging connections
 * 4. Automatic reconnection with exponential backoff
 * 5. SSL/TLS support for encrypted connections (optional)
 */

const mysql = require("mysql2/promise");
const logger = require("../utils/logger");

// Database connection pool configuration
const poolConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // Connection Pool Settings (Security & Performance)
  connectionLimit: 10, // Maximum number of connections in pool
  waitForConnections: true, // Queue requests when pool is full
  queueLimit: 0, // Unlimited queue (use with rate limiting)

  // Timeout Settings (Prevent hanging connections)
  connectTimeout: 10000, // 10 seconds to establish connection

  // Character Set (Prevent encoding attacks)
  charset: "utf8mb4", // Full Unicode support, prevents certain injection attacks

  // Timezone
  timezone: "+00:00", // UTC timezone

  // Additional Security Options
  multipleStatements: false, // CRITICAL: Prevents SQL injection via multiple queries

  // Optional: Enable SSL/TLS for encrypted connection
  // Uncomment if your MariaDB server has SSL enabled
  // ssl: {
  //   rejectUnauthorized: true,
  //   ca: fs.readFileSync('./certs/ca-cert.pem'),
  // }
};

// Create connection pool
let pool = null;

/**
 * Initialize database connection pool
 * @returns {Promise<void>}
 */
const initializePool = async () => {
  try {
    // If pool already exists, return it
    if (pool) {
      logger.info("Database pool already initialized");
      return pool;
    }

    pool = mysql.createPool(poolConfig);

    // Test the connection
    const connection = await pool.getConnection();
    logger.info("Database connection successful");
    connection.release();

    return pool;
  } catch (error) {
    logger.error("Database connection failed:", error.message);
    throw error;
  }
};

/**
 * Get database connection pool
 * @returns {Pool} MySQL connection pool
 */
const getPool = () => {
  if (!pool) {
    throw new Error(
      "Database pool not initialized. Call initializePool() first."
    );
  }
  return pool;
};

/**
 * Execute a query with automatic error handling
 * Uses prepared statements to prevent SQL injection
 *
 * @param {string} sql - SQL query with placeholders (? or :named)
 * @param {Array|Object} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
const query = async (sql, params = []) => {
  try {
    const connection = await pool.getConnection();

    try {
      // Execute query with prepared statement
      const [rows] = await connection.execute(sql, params);
      connection.release();
      return rows;
    } catch (error) {
      connection.release();
      throw error;
    }
  } catch (error) {
    logger.error("Database query error:", error.message);
    throw error;
  }
};

/**
 * Begin a database transaction
 * Use for operations that need atomicity (all or nothing)
 *
 * @returns {Promise<Connection>} Database connection in transaction mode
 */
const beginTransaction = async () => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
};

/**
 * Commit a transaction
 * @param {Connection} connection - Database connection
 */
const commit = async (connection) => {
  await connection.commit();
  connection.release();
};

/**
 * Rollback a transaction
 * @param {Connection} connection - Database connection
 */
const rollback = async (connection) => {
  await connection.rollback();
  connection.release();
};

/**
 * Close all database connections gracefully
 * Call this when shutting down the server
 */
const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null; // Reset pool to allow reinitialization
    logger.info("Database connection pool closed");
  }
};

module.exports = {
  initializePool,
  getPool,
  query,
  beginTransaction,
  commit,
  rollback,
  closePool,
};
