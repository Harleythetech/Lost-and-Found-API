/**
 * Authentication Middleware
 * Protects routes and enforces authentication
 *
 * SECURITY FEATURES:
 * 1. JWT token verification
 * 2. Role-based access control (RBAC)
 * 3. Account status checking
 * 4. Token extraction from Authorization header
 * 5. Request context injection
 */

const { verifyAccessToken } = require("../utils/jwt");
const db = require("../config/database");
const logger = require("../utils/logger");

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 *
 * Usage: app.get('/protected-route', authenticate, handler)
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // 2. Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message || "Invalid or expired token",
      });
    }

    // 3. Get user from database (verify user still exists and is active)
    const users = await db.query(
      `SELECT id, school_id, email, first_name, last_name, role, status, 
              email_verified, two_factor_enabled, locked_until
       FROM users 
       WHERE id = ? AND deleted_at IS NULL`,
      [decoded.id]
    );

    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found or has been deleted",
      });
    }

    const user = users[0];

    // 4. Check account status
    if (user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Account has been suspended. Contact administrator.",
      });
    }

    if (user.status === "deleted") {
      return res.status(403).json({
        success: false,
        message: "Account has been deleted",
      });
    }

    if (user.status === "pending") {
      return res.status(403).json({
        success: false,
        message: "Account is pending approval",
      });
    }

    // 5. Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.locked_until) - new Date()) / 1000 / 60
      );
      return res.status(403).json({
        success: false,
        message: `Account is locked. Try again in ${lockTimeRemaining} minutes.`,
      });
    }

    // 6. Attach user to request object
    req.user = {
      id: user.id,
      school_id: user.school_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      status: user.status,
      email_verified: user.email_verified,
      two_factor_enabled: user.two_factor_enabled,
    };

    next();
  } catch (error) {
    logger.error("Authentication error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
};

/**
 * Role Authorization Middleware
 * Restricts access based on user roles
 *
 * Usage: app.get('/admin-only', authenticate, authorize(['admin']), handler)
 *
 * @param {Array} roles - Array of allowed roles
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(
        `Unauthorized access attempt by user ${req.user.school_id} to role-restricted resource`
      );
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions.",
      });
    }

    next();
  };
};

/**
 * Optional Authentication
 * Attaches user if token is present, but doesn't require it
 * Useful for public routes that have different behavior for logged-in users
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(); // Continue without authentication
    }

    const token = authHeader.substring(7);

    try {
      const decoded = verifyAccessToken(token);

      const users = await db.query(
        `SELECT id, school_id, email, first_name, last_name, role, status 
         FROM users 
         WHERE id = ? AND deleted_at IS NULL AND status = 'active'`,
        [decoded.id]
      );

      if (users && users.length > 0) {
        req.user = users[0];
      }
    } catch (error) {
      // Token invalid, but that's okay for optional auth
      logger.debug("Optional auth: Invalid token provided");
    }

    next();
  } catch (error) {
    logger.error("Optional authentication error:", error);
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
};
