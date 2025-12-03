/**
 * Security Middleware - Production-Grade Protection
 *
 * SECURITY LAYERS:
 * 1. Helmet - Security headers
 * 2. Rate Limiting - DDoS protection
 * 3. CORS - Cross-origin resource sharing
 * 4. HPP - HTTP Parameter Pollution protection
 *
 * Note: Using MariaDB (not MongoDB), so NoSQL sanitization not needed
 * XSS protection handled by input validation + parameterized queries
 */

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const hpp = require("hpp");

/**
 * Helmet Configuration
 * Sets secure HTTP headers
 */
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
});

/**
 * Rate Limiter - General API
 * Prevents brute force and DDoS attacks
 * Higher limits in test environment to avoid flaky tests
 */
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max:
    process.env.NODE_ENV === "test"
      ? 10000
      : parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 300, // Higher limit in test
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests. Please try again later.",
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * Strict Rate Limiter - Authentication Routes
 * Extra protection for login/register endpoints
 * More lenient in test environment to allow test execution
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "test" ? 1000 : 100, // Higher limit in test (1000 vs 100)
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    success: false,
    message:
      "Too many authentication attempts. Account temporarily locked for 15 minutes.",
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many login attempts. Please try again in 15 minutes.",
    });
  },
});

/**
 * CORS Configuration
 * Controls which domains can access the API
 */
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["http://localhost:3000"];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // Allow cookies
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

/**
 * Apply all security middleware to Express app
 */
const applySecurityMiddleware = (app) => {
  // 1. Security headers
  app.use(helmetConfig);

  // 2. CORS
  app.use(cors(corsOptions));

  // 3. Rate limiting (general)
  app.use("/api", generalLimiter);

  // 4. HTTP Parameter Pollution protection
  app.use(hpp());

  // 5. Disable X-Powered-By header (hide Express)
  app.disable("x-powered-by");

  // 6. Trust proxy (if behind nginx/apache)
  app.set("trust proxy", 1);
};

module.exports = {
  applySecurityMiddleware,
  authLimiter,
  generalLimiter,
  corsOptions,
};
