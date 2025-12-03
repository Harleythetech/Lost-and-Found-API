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
const { formatValidationErrors } = require("../utils/validationErrorFormatter");

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
      return res.status(400).json(formatValidationErrors(errors.array()));
    }

    const {
      school_id,
      first_name,
      last_name,
      email,
      contact_number,
      password,
      // Optional personal information
      date_of_birth,
      gender,
      address_line1,
      address_line2,
      city,
      province,
      postal_code,
      emergency_contact_name,
      emergency_contact_number,
      department,
      year_level,
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

    // 6. Validate all required fields are present
    if (!school_id || !first_name || !last_name || !email || !contact_number) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required: school_id, first_name, last_name, email, contact_number, password",
      });
    }

    // 7. Validate required personal info fields
    if (!date_of_birth) {
      return res.status(400).json({
        success: false,
        message: "Date of birth is required",
      });
    }

    if (!gender) {
      return res.status(400).json({
        success: false,
        message: "Gender is required",
      });
    }

    if (!address_line1) {
      return res.status(400).json({
        success: false,
        message: "Address is required",
      });
    }

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "City is required",
      });
    }

    if (!province) {
      return res.status(400).json({
        success: false,
        message: "Province is required",
      });
    }

    if (!postal_code) {
      return res.status(400).json({
        success: false,
        message: "Postal code is required",
      });
    }

    if (!emergency_contact_name) {
      return res.status(400).json({
        success: false,
        message: "Emergency contact name is required",
      });
    }

    if (!emergency_contact_number) {
      return res.status(400).json({
        success: false,
        message: "Emergency contact number is required",
      });
    }

    if (!department) {
      return res.status(400).json({
        success: false,
        message: "Department is required",
      });
    }

    if (!year_level) {
      return res.status(400).json({
        success: false,
        message: "Year level is required",
      });
    }

    // 8. Validate field formats
    // Date of birth validation
    let validatedDob = null;
    if (date_of_birth) {
      const dob = new Date(date_of_birth);
      if (isNaN(dob.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date of birth format. Use YYYY-MM-DD",
        });
      }
      const age = Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      if (age < 13 || age > 120) {
        return res.status(400).json({
          success: false,
          message: "Invalid date of birth",
        });
      }
      validatedDob = date_of_birth;
    }

    // Gender validation
    let validatedGender = null;
    if (gender) {
      const validGenders = ["male", "female", "other", "prefer_not_to_say"];
      if (!validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid gender value. Use: male, female, other, or prefer_not_to_say",
        });
      }
      validatedGender = gender;
    }

    // Emergency contact number validation
    if (
      emergency_contact_number &&
      !/^[0-9+\-()\s]{7,20}$/.test(emergency_contact_number)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid emergency contact number format",
      });
    }

    // 8. Insert new user with all fields
    const insertParams = [
      school_id,
      first_name,
      last_name,
      email,
      contact_number,
      password_hash,
      validatedDob,
      validatedGender,
      address_line1,
      address_line2 || null,
      city,
      province,
      postal_code,
      emergency_contact_name,
      emergency_contact_number,
      department,
      year_level,
    ];

    const result = await connection.execute(
      `INSERT INTO users (
        school_id, first_name, last_name, email, contact_number, 
        password_hash, date_of_birth, gender, address_line1, address_line2,
        city, province, postal_code, emergency_contact_name, emergency_contact_number,
        department, year_level, role, status, password_changed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', 'pending', NOW())`,
      insertParams
    );

    const userId = result[0].insertId;

    // 9. Log activity - ensure all parameters are defined
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

    // 10. Commit transaction
    await db.commit(connection);

    logger.info(`New user registered: ${school_id}`);

    // 11. Send success response (NO PASSWORD IN RESPONSE!)
    res.status(201).json({
      success: true,
      message:
        "Registration successful. Your account is pending approval by an administrator.",
      data: {
        id: userId,
        school_id,
        first_name,
        last_name,
        email,
        contact_number,
        date_of_birth: validatedDob,
        gender: validatedGender,
        address_line1: address_line1 || null,
        city: city || null,
        province: province || null,
        department: department || null,
        year_level: year_level || null,
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
      return res.status(400).json(formatValidationErrors(errors.array()));
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
      `SELECT id, school_id, first_name, last_name, email, contact_number,
              date_of_birth, gender, address_line1, address_line2,
              city, province, postal_code, emergency_contact_name, emergency_contact_number,
              department, year_level, role, status, email_verified, two_factor_enabled, created_at
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
 * Update User Profile
 * PUT /api/auth/profile
 * Requires authentication
 *
 * Note: school_id and email CANNOT be changed (bound to Firebase)
 */
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(formatValidationErrors(errors.array()));
    }

    const userId = req.user.id;

    const {
      first_name,
      last_name,
      contact_number,
      date_of_birth,
      gender,
      address_line1,
      address_line2,
      city,
      province,
      postal_code,
      emergency_contact_name,
      emergency_contact_number,
      department,
      year_level,
    } = req.body;

    // Build dynamic update query (only update provided fields)
    const updates = [];
    const params = [];

    if (first_name !== undefined) {
      // Validate name format
      const nameRegex = /^[a-zA-Z\s'-]+$/;
      if (
        !nameRegex.test(first_name) ||
        first_name.length < 2 ||
        first_name.length > 100
      ) {
        return res.status(400).json({
          success: false,
          message:
            "First name must be 2-100 characters and contain only letters, spaces, hyphens, and apostrophes",
        });
      }
      updates.push("first_name = ?");
      params.push(first_name.trim());
    }

    if (last_name !== undefined) {
      const nameRegex = /^[a-zA-Z\s'-]+$/;
      if (
        !nameRegex.test(last_name) ||
        last_name.length < 2 ||
        last_name.length > 100
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Last name must be 2-100 characters and contain only letters, spaces, hyphens, and apostrophes",
        });
      }
      updates.push("last_name = ?");
      params.push(last_name.trim());
    }

    if (contact_number !== undefined) {
      // Validate PH mobile format
      const phMobileRegex = /^(09|\+639)[0-9]{9}$/;
      if (!phMobileRegex.test(contact_number.trim())) {
        return res.status(400).json({
          success: false,
          message:
            "Contact number must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)",
        });
      }
      updates.push("contact_number = ?");
      params.push(contact_number.trim());
    }

    if (date_of_birth !== undefined) {
      const dob = new Date(date_of_birth);
      if (isNaN(dob.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date of birth format. Use YYYY-MM-DD",
        });
      }
      const age = Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      if (age < 13 || age > 120) {
        return res.status(400).json({
          success: false,
          message: "Invalid date of birth",
        });
      }
      updates.push("date_of_birth = ?");
      params.push(date_of_birth);
    }

    if (gender !== undefined) {
      const validGenders = ["male", "female", "other", "prefer_not_to_say"];
      if (!validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid gender value. Use: male, female, other, or prefer_not_to_say",
        });
      }
      updates.push("gender = ?");
      params.push(gender);
    }

    if (address_line1 !== undefined) {
      updates.push("address_line1 = ?");
      params.push(address_line1.trim());
    }

    if (address_line2 !== undefined) {
      updates.push("address_line2 = ?");
      params.push(address_line2 ? address_line2.trim() : null);
    }

    if (city !== undefined) {
      updates.push("city = ?");
      params.push(city.trim());
    }

    if (province !== undefined) {
      updates.push("province = ?");
      params.push(province.trim());
    }

    if (postal_code !== undefined) {
      updates.push("postal_code = ?");
      params.push(postal_code.trim());
    }

    if (emergency_contact_name !== undefined) {
      updates.push("emergency_contact_name = ?");
      params.push(emergency_contact_name.trim());
    }

    if (emergency_contact_number !== undefined) {
      if (!/^[0-9+\-()\s]{7,20}$/.test(emergency_contact_number)) {
        return res.status(400).json({
          success: false,
          message: "Invalid emergency contact number format",
        });
      }
      updates.push("emergency_contact_number = ?");
      params.push(emergency_contact_number.trim());
    }

    if (department !== undefined) {
      updates.push("department = ?");
      params.push(department.trim());
    }

    if (year_level !== undefined) {
      updates.push("year_level = ?");
      params.push(year_level.trim());
    }

    // Check if there's anything to update
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    // Add updated_at
    updates.push("updated_at = NOW()");
    params.push(userId);

    // Execute update
    await db.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (
        user_id, ip_address, user_agent, action, description, status
      ) VALUES (?, ?, ?, 'update_profile', 'User updated their profile', 'success')`,
      [
        userId,
        req.ip || req.connection?.remoteAddress || "0.0.0.0",
        req.headers["user-agent"] || "unknown",
      ]
    );

    // Fetch updated profile
    const users = await db.query(
      `SELECT id, school_id, first_name, last_name, email, contact_number,
              date_of_birth, gender, address_line1, address_line2,
              city, province, postal_code, emergency_contact_name, emergency_contact_number,
              department, year_level, role, status, email_verified, two_factor_enabled, created_at
       FROM users 
       WHERE id = ? AND deleted_at IS NULL`,
      [userId]
    );

    logger.info(`User profile updated: ${req.user.school_id}`);

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: users[0],
    });
  } catch (error) {
    logger.error("Update profile error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update profile",
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

/**
 * Manage User Status (Admin Only)
 * POST /api/auth/users/:userId/manage
 *
 * Unified endpoint for user management actions:
 * - approve: pending → active
 * - decline: pending → deleted (soft delete)
 * - suspend: active → suspended (with optional duration)
 * - unsuspend: suspended → active
 *
 * Body: {
 *   action: 'approve' | 'decline' | 'suspend' | 'unsuspend',
 *   reason?: string (for decline/suspend),
 *   duration_days?: number (for suspend)
 * }
 */
const manage_user = async (req, res) => {
  let connection;

  try {
    const { userId } = req.params;
    const { action, reason, duration_days } = req.body;
    const adminId = req.user.id;

    // Validate action
    const validActions = ["approve", "decline", "suspend", "unsuspend"];
    if (!action || !validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: `Invalid action. Must be one of: ${validActions.join(", ")}`,
      });
    }

    // Prevent self-suspension
    if (action === "suspend" && parseInt(userId) === adminId) {
      return res.status(400).json({
        success: false,
        message: "You cannot suspend your own account",
      });
    }

    // Get user details
    const users = await db.query(
      `SELECT id, school_id, first_name, last_name, email, role, status 
       FROM users 
       WHERE id = ? AND deleted_at IS NULL`,
      [userId]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    // Action-specific validations
    switch (action) {
      case "approve":
        if (user.status === "active") {
          return res.status(400).json({
            success: false,
            message: "User is already active",
          });
        }
        if (user.status === "suspended") {
          return res.status(400).json({
            success: false,
            message: "Cannot approve suspended user. Use unsuspend instead.",
          });
        }
        if (user.status !== "pending") {
          return res.status(400).json({
            success: false,
            message: "Can only approve pending users",
          });
        }
        break;

      case "decline":
        if (user.status !== "pending") {
          return res.status(400).json({
            success: false,
            message: "Can only decline pending users",
          });
        }
        break;

      case "suspend":
        if (user.role === "admin") {
          return res.status(403).json({
            success: false,
            message: "Cannot suspend admin users",
          });
        }
        if (user.status === "suspended") {
          return res.status(400).json({
            success: false,
            message: "User is already suspended",
          });
        }
        if (user.status === "pending") {
          return res.status(400).json({
            success: false,
            message: "Cannot suspend pending users. Use decline instead.",
          });
        }
        break;

      case "unsuspend":
        if (user.status !== "suspended") {
          return res.status(400).json({
            success: false,
            message: "User is not suspended",
          });
        }
        break;
    }

    // Begin transaction
    connection = await db.beginTransaction();

    let updateQuery;
    let updateParams;
    let logDescription;
    let newStatus;

    // Execute action-specific logic
    switch (action) {
      case "approve":
        updateQuery = `UPDATE users SET status = 'active', updated_at = NOW() WHERE id = ?`;
        updateParams = [userId];
        logDescription = `Admin approved user: ${user.school_id}`;
        newStatus = "active";
        break;

      case "decline":
        updateQuery = `UPDATE users SET deleted_at = NOW(), status = 'deleted', updated_at = NOW() WHERE id = ?`;
        updateParams = [userId];
        logDescription = reason
          ? `Admin declined user: ${user.school_id}. Reason: ${reason}`
          : `Admin declined user: ${user.school_id}`;
        newStatus = "deleted";
        break;

      case "suspend":
        const lockedUntil =
          duration_days && parseInt(duration_days) > 0
            ? `DATE_ADD(NOW(), INTERVAL ${parseInt(duration_days)} DAY)`
            : null;

        updateQuery = lockedUntil
          ? `UPDATE users SET status = 'suspended', locked_until = ${lockedUntil}, refresh_token = NULL, refresh_token_expires = NULL, updated_at = NOW() WHERE id = ?`
          : `UPDATE users SET status = 'suspended', refresh_token = NULL, refresh_token_expires = NULL, updated_at = NOW() WHERE id = ?`;

        updateParams = [userId];
        logDescription = reason
          ? `Admin suspended user: ${user.school_id}. Reason: ${reason}${
              duration_days ? `. Duration: ${duration_days} days` : ""
            }`
          : `Admin suspended user: ${user.school_id}${
              duration_days ? ` for ${duration_days} days` : ""
            }`;
        newStatus = "suspended";
        break;

      case "unsuspend":
        updateQuery = `UPDATE users SET status = 'active', locked_until = NULL, login_attempts = 0, updated_at = NOW() WHERE id = ?`;
        updateParams = [userId];
        logDescription = `Admin unsuspended user: ${user.school_id}`;
        newStatus = "active";
        break;
    }

    // Execute update
    await connection.execute(updateQuery, updateParams);

    // Log activity
    await connection.execute(
      `INSERT INTO activity_logs (
        user_id, ip_address, user_agent, action, resource_type, 
        resource_id, description, status
      ) VALUES (?, ?, ?, ?, 'user', ?, ?, 'success')`,
      [
        adminId,
        req.ip || "0.0.0.0",
        req.headers["user-agent"] || "unknown",
        `${action}_user`,
        userId,
        logDescription,
      ]
    );

    // Commit transaction
    await db.commit(connection);

    // Log appropriate message
    const logLevel = action === "suspend" ? "warn" : "info";
    logger[logLevel](`User ${action}ed by admin: ${user.school_id}`);

    // Build response data
    const responseData = {
      userId: user.id,
      school_id: user.school_id,
      first_name: user.first_name,
      last_name: user.last_name,
      status: newStatus,
    };

    if (action === "decline" || action === "suspend") {
      responseData.reason = reason || null;
    }

    if (action === "suspend" && duration_days) {
      responseData.duration_days = duration_days;
    }

    res.json({
      success: true,
      message: `User ${action}ed successfully`,
      data: responseData,
    });
  } catch (error) {
    if (connection) {
      await db.rollback(connection);
    }

    logger.error(`Manage user error (${req.body.action}):`, error);

    res.status(500).json({
      success: false,
      message: `Failed to ${req.body.action || "manage"} user`,
    });
  }
};

/**
 * Request Password Reset
 * POST /api/auth/forgot-password
 * Public access
 *
 * Generates reset token and sends email
 */
const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(formatValidationErrors(errors.array()));
    }

    const { email } = req.body;

    // Find user by email
    const userQuery = `
      SELECT id, school_id, first_name, last_name, email, status
      FROM users
      WHERE email = ? AND deleted_at IS NULL
    `;
    const users = await db.query(userQuery, [email]);

    // Always return success even if email doesn't exist (security)
    if (users.length === 0) {
      logger.info(`Password reset requested for non-existent email: ${email}`);
      return res.json({
        success: true,
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }

    const user = users[0];

    // Check if account is active
    if (user.status !== "active") {
      logger.info(`Password reset requested for inactive account: ${email}`);
      return res.json({
        success: true,
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }

    // Generate reset token
    const passwordResetService = require("../services/passwordResetService");
    const { token } = await passwordResetService.createResetToken(user.id);

    // Send email
    const emailService = require("../services/emailService");
    await emailService.sendPasswordResetEmail(user, token);

    logger.info(`Password reset token generated for user: ${user.school_id}`);

    res.json({
      success: true,
      message:
        "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    logger.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process password reset request",
    });
  }
};

/**
 * Verify Reset Token
 * GET /api/auth/reset-password/:token
 * Public access
 *
 * Checks if reset token is valid
 */
const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;

    const passwordResetService = require("../services/passwordResetService");
    const tokenData = await passwordResetService.verifyResetToken(token);

    if (!tokenData) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    res.json({
      success: true,
      message: "Token is valid",
      data: {
        email: tokenData.email,
        school_id: tokenData.school_id,
      },
    });
  } catch (error) {
    logger.error("Verify reset token error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify reset token",
    });
  }
};

/**
 * Reset Password
 * POST /api/auth/reset-password
 * Public access
 *
 * Resets password using valid token
 */
const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(formatValidationErrors(errors.array()));
    }

    const { token, new_password } = req.body;

    // Verify token
    const passwordResetService = require("../services/passwordResetService");
    const tokenData = await passwordResetService.verifyResetToken(token);

    if (!tokenData) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(
      new_password,
      parseInt(process.env.BCRYPT_ROUNDS) || 12
    );

    // Update password and reset login attempts
    const updateQuery = `
      UPDATE users
      SET password_hash = ?,
          password_changed_at = NOW(),
          login_attempts = 0,
          locked_until = NULL,
          updated_at = NOW()
      WHERE id = ?
    `;
    await db.query(updateQuery, [hashedPassword, tokenData.user_id]);

    // Mark token as used
    await passwordResetService.markTokenAsUsed(token);

    // Send confirmation email
    const emailService = require("../services/emailService");
    await emailService.sendPasswordResetConfirmation({
      email: tokenData.email,
      first_name: tokenData.first_name,
    });

    logger.info(`Password reset successful for user: ${tokenData.school_id}`);

    res.json({
      success: true,
      message:
        "Password reset successful. You can now login with your new password.",
    });
  } catch (error) {
    logger.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset password",
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  logout,
  manage_user,
  forgotPassword,
  verifyResetToken,
  resetPassword,
};
