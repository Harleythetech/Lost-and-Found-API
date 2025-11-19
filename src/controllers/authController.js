/**
 * Authentication Controller
 * Handles user registration, login, and token management
 *
 * SECURITY IMPLEMENTATION:
 * 1. Bcrypt password hashing (12 rounds)
 * 2. Account lockout after failed attempts
 * 3. JWT token generation
 * 4. Activity logging
 * 5. Input validation
 * 6. SQL injection prevention (parameterized queries)
 */

const bcrypt = require("bcrypt");
const { validationResult } = require("express-validator");
const db = require("../config/database");
const { generateTokenPair } = require("../utils/jwt");
const logger = require("../utils/logger");

/**
 * User Registration
 * POST /api/auth/register
 *
 * Security features:
 * - Password hashing with bcrypt
 * - School ID uniqueness check
 * - Email uniqueness check (if provided)
 * - Default role: 'user'
 * - Default status: 'pending' (requires admin approval)
 */
const register = async (req, res) => {
  let connection;

  try {
    // 1. Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      school_id,
      first_name,
      last_name,
      email,
      contact_number,
      password,
    } = req.body;

    // 2. Check if school ID already exists
    const existingUser = await db.query(
      "SELECT id FROM users WHERE school_id = ? AND deleted_at IS NULL",
      [school_id]
    );

    if (existingUser && existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "School ID already registered",
      });
    }

    // 3. Check if email already exists (if provided)
    if (email) {
      const existingEmail = await db.query(
        "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL",
        [email]
      );

      if (existingEmail && existingEmail.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email already registered",
        });
      }
    }

    // 4. Hash password (12 rounds - secure and performant)
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // 5. Begin transaction
    connection = await db.beginTransaction();

    // 6. Insert new user
    const insertParams = [
      school_id,
      first_name,
      last_name,
      email === undefined || email === "" ? null : email,
      contact_number === undefined || contact_number === ""
        ? null
        : contact_number,
      password_hash,
    ];

    const result = await connection.execute(
      `INSERT INTO users (
        school_id, first_name, last_name, email, contact_number, 
        password_hash, role, status, password_changed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'user', 'pending', NOW())`,
      insertParams
    );

    const userId = result[0].insertId;

    // 7. Log activity - ensure all parameters are defined
    const activityParams = [
      userId,
      req.ip || req.connection?.remoteAddress || "0.0.0.0",
      req.headers["user-agent"] || "unknown",
      userId,
      `User registered with school ID: ${school_id}`,
    ];

    await connection.execute(
      `INSERT INTO activity_logs (
        user_id, ip_address, user_agent, action, resource_type, 
        resource_id, description, status
      ) VALUES (?, ?, ?, 'register', 'user', ?, ?, 'success')`,
      activityParams
    );

    // 8. Commit transaction
    await db.commit(connection);

    logger.info(`New user registered: ${school_id}`);

    // 9. Send success response (NO PASSWORD IN RESPONSE!)
    res.status(201).json({
      success: true,
      message:
        "Registration successful. Your account is pending approval by an administrator.",
      data: {
        id: userId,
        school_id,
        first_name,
        last_name,
        email: email || null,
        status: "pending",
      },
    });
  } catch (error) {
    // Rollback on error
    if (connection) {
      await db.rollback(connection);
    }

    logger.error("Registration error:", error);

    res.status(500).json({
      success: false,
      message: "Registration failed. Please try again later.",
    });
  }
};

/**
 * User Login
 * POST /api/auth/login
 *
 * Security features:
 * - Account lockout after 5 failed attempts
 * - 15-minute lockout duration
 * - Password comparison with bcrypt
 * - JWT token generation
 * - Login attempt tracking
 * - Activity logging
 */
const login = async (req, res) => {
  try {
    // 1. Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { school_id, password } = req.body;
    const ipAddress = req.ip || req.connection?.remoteAddress || "0.0.0.0";
    const userAgent = req.headers["user-agent"] || "unknown";

    // 2. Get user from database
    const users = await db.query(
      `SELECT id, school_id, email, password_hash, first_name, last_name, 
              role, status, email_verified, login_attempts, locked_until
       FROM users 
       WHERE school_id = ? AND deleted_at IS NULL`,
      [school_id]
    );

    if (!users || users.length === 0) {
      // Log failed attempt
      await db.query(
        `INSERT INTO activity_logs (
          ip_address, user_agent, action, description, status
        ) VALUES (?, ?, 'login', ?, 'failed')`,
        [
          ipAddress,
          userAgent,
          `Failed login attempt for school ID: ${school_id}`,
        ]
      );

      return res.status(401).json({
        success: false,
        message: "Invalid school ID or password",
      });
    }

    const user = users[0];

    // 3. Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.locked_until) - new Date()) / 1000 / 60
      );

      await db.query(
        `INSERT INTO activity_logs (
          user_id, ip_address, user_agent, action, description, status
        ) VALUES (?, ?, ?, 'login', ?, 'failed')`,
        [user.id, ipAddress, userAgent, "Login attempt while account locked"]
      );

      return res.status(403).json({
        success: false,
        message: `Account is locked due to multiple failed login attempts. Try again in ${lockTimeRemaining} minutes.`,
      });
    }

    // 4. Check account status
    if (user.status !== "active") {
      await db.query(
        `INSERT INTO activity_logs (
          user_id, ip_address, user_agent, action, description, status
        ) VALUES (?, ?, ?, 'login', ?, 'failed')`,
        [
          user.id,
          ipAddress,
          userAgent,
          `Login attempt with ${user.status} account`,
        ]
      );

      let message = "Account is not active";
      if (user.status === "pending") {
        message = "Account is pending admin approval";
      } else if (user.status === "suspended") {
        message = "Account has been suspended. Contact administrator.";
      }

      return res.status(403).json({
        success: false,
        message,
      });
    }

    // 5. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment login attempts
      const newAttempts = (user.login_attempts || 0) + 1;
      const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
      const lockTimeMinutes = parseInt(process.env.LOCK_TIME_MINUTES) || 15;

      if (newAttempts >= maxAttempts) {
        // Lock account
        await db.query(
          `UPDATE users 
           SET login_attempts = ?, 
               locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
           WHERE id = ?`,
          [newAttempts, lockTimeMinutes, user.id]
        );

        await db.query(
          `INSERT INTO activity_logs (
            user_id, ip_address, user_agent, action, description, status
          ) VALUES (?, ?, ?, 'login', ?, 'failed')`,
          [
            user.id,
            ipAddress,
            userAgent,
            `Account locked after ${maxAttempts} failed attempts`,
          ]
        );

        logger.warn(`Account locked for user: ${school_id}`);

        return res.status(403).json({
          success: false,
          message: `Account locked due to ${maxAttempts} failed login attempts. Try again in ${lockTimeMinutes} minutes.`,
        });
      } else {
        // Increment attempt counter
        await db.query("UPDATE users SET login_attempts = ? WHERE id = ?", [
          newAttempts,
          user.id,
        ]);

        await db.query(
          `INSERT INTO activity_logs (
            user_id, ip_address, user_agent, action, description, status
          ) VALUES (?, ?, ?, 'login', ?, 'failed')`,
          [
            user.id,
            ipAddress,
            userAgent,
            `Failed login attempt (${newAttempts}/${maxAttempts})`,
          ]
        );

        return res.status(401).json({
          success: false,
          message: `Invalid school ID or password. ${
            maxAttempts - newAttempts
          } attempts remaining.`,
        });
      }
    }

    // 6. Login successful! Generate tokens
    const tokens = generateTokenPair(user);

    // 7. Update user record
    await db.query(
      `UPDATE users 
       SET login_attempts = 0, 
           locked_until = NULL, 
           last_login = NOW(),
           refresh_token = ?,
           refresh_token_expires = DATE_ADD(NOW(), INTERVAL 30 DAY)
       WHERE id = ?`,
      [tokens.refreshToken, user.id]
    );

    // 8. Log successful login
    await db.query(
      `INSERT INTO activity_logs (
        user_id, ip_address, user_agent, action, description, status
      ) VALUES (?, ?, ?, 'login', 'Successful login', 'success')`,
      [user.id, ipAddress, userAgent]
    );

    logger.info(`User logged in: ${school_id}`);

    // 9. Send response
    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          school_id: user.school_id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          email_verified: user.email_verified,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      },
    });
  } catch (error) {
    logger.error("Login error:", error);

    res.status(500).json({
      success: false,
      message: "Login failed. Please try again later.",
    });
  }
};

/**
 * Get Current User Profile
 * GET /api/auth/me
 * Requires authentication
 */
const getProfile = async (req, res) => {
  try {
    // User is already attached by authenticate middleware
    const users = await db.query(
      `SELECT id, school_id, email, first_name, last_name, contact_number,
              role, status, email_verified, two_factor_enabled, created_at
       FROM users 
       WHERE id = ? AND deleted_at IS NULL`,
      [req.user.id]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    logger.error("Get profile error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve profile",
    });
  }
};

/**
 * Logout
 * POST /api/auth/logout
 * Invalidates refresh token
 */
const logout = async (req, res) => {
  try {
    // Clear refresh token from database
    await db.query(
      `UPDATE users 
       SET refresh_token = NULL, refresh_token_expires = NULL 
       WHERE id = ?`,
      [req.user.id]
    );

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (
        user_id, ip_address, user_agent, action, description, status
      ) VALUES (?, ?, ?, 'logout', 'User logged out', 'success')`,
      [
        req.user.id,
        req.ip || req.connection?.remoteAddress || "0.0.0.0",
        req.headers["user-agent"] || "unknown",
      ]
    );

    logger.info(`User logged out: ${req.user.school_id}`);

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    logger.error("Logout error:", error);

    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  logout,
};
