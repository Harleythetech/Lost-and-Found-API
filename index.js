require("dotenv").config();
const express = require("express");
const logger = require("./src/utils/logger");
const { initializePool, closePool } = require("./src/config/database");
const { applySecurityMiddleware } = require("./src/middleware/security");

const app = express();

// ============================================
// SECURITY MIDDLEWARE (MUST BE FIRST!)
// ============================================
applySecurityMiddleware(app);

// ============================================
// BODY PARSING MIDDLEWARE
// ============================================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ============================================
// REQUEST LOGGING (Development)
// ============================================
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });
}

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get("/health", (req, res) => {
  res.json({
    success: true,
    version: "1.0.0",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// API ROUTES
// ============================================
const authRoutes = require("./src/routes/authRoutes");
const lostItemRoutes = require("./src/routes/lostItemRoutes");
const foundItemRoutes = require("./src/routes/foundItemRoutes");
const categoryRoutes = require("./src/routes/categoryRoutes");
const locationRoutes = require("./src/routes/locationRoutes");
const matchRoutes = require("./src/routes/matchRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/lost-items", lostItemRoutes);
app.use("/api/found-items", foundItemRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/matches", matchRoutes);

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  logger.error("Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
  });
});

// Initialize server
const startServer = async () => {
  try {
    // Initialize database connection pool
    await initializePool();

    // Start Express server
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => {
      logger.info("=".repeat(50));
      logger.info("Lost and Found API Started");
    });
  } catch (error) {
    logger.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  await closePool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down gracefully...");
  await closePool();
  process.exit(0);
});

// Export app for testing
module.exports = app;

// Start the server only if this file is run directly (not imported)
if (require.main === module) {
  startServer();
}
