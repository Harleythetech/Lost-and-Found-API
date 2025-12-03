/**
 * Firebase Authentication Integration
 *
 * Installation:
 * npm install firebase-admin
 *
 * Setup:
 * 1. Download service account JSON from Firebase Console
 * 2. Save as firebase-service-account.json in project root
 * 3. Add to .gitignore
 * 4. Set FIREBASE_ENABLED=true in .env
 */

const admin = require("firebase-admin");
const db = require("../config/database");
const { generateTokenPair } = require("../utils/jwt");
const logger = require("../utils/logger");

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) return;

  try {
    let serviceAccount;

    // Try to load Firebase service account JSON
    // First try the standard name
    try {
      serviceAccount = require("../../firebase-service-account.json");
    } catch (err) {
      // If not found, try to find any Firebase service account file
      const fs = require("fs");
      const path = require("path");
      const projectRoot = path.resolve(__dirname, "../..");
      const files = fs.readdirSync(projectRoot);

      // Look for Firebase service account JSON pattern
      const firebaseFile = files.find(
        (file) => file.includes("firebase-adminsdk") && file.endsWith(".json")
      );

      if (firebaseFile) {
        serviceAccount = require(path.join(projectRoot, firebaseFile));
        logger.info(`Loading Firebase service account from: ${firebaseFile}`);
      } else {
        throw new Error(
          "No Firebase service account JSON file found. Please add firebase-service-account.json or a Firebase Admin SDK JSON file to project root."
        );
      }
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    logger.info("Firebase Admin SDK initialized successfully");
  } catch (error) {
    logger.error("Firebase initialization failed:", error.message);
    logger.warn("Firebase authentication will be disabled");
  }
};

// Initialize if enabled
if (process.env.FIREBASE_ENABLED === "true") {
  initializeFirebase();
}

/**
 * Verify Firebase ID Token
 * @param {string} idToken - Firebase ID token from client
 * @returns {object} Decoded token with user info
 */
const verifyFirebaseToken = async (idToken) => {
  if (!firebaseInitialized) {
    throw new Error("Firebase is not initialized");
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error(`Invalid Firebase token: ${error.message}`);
  }
};

/**
 * Link Firebase account to existing school ID
 * POST /api/auth/firebase/link
 *
 * Body: {
 *   firebase_token: "Firebase ID token",
 *   school_id: "25-1234",
 *   password: "user's password"
 * }
 */
const linkFirebaseAccount = async (req, res) => {
  let connection;

  try {
    const { firebase_token, school_id, password } = req.body;

    if (!firebase_token || !school_id || !password) {
      return res.status(400).json({
        success: false,
        message: "Firebase token, school ID, and password are required",
      });
    }

    // Verify Firebase token
    const firebaseUser = await verifyFirebaseToken(firebase_token);

    // Check if user exists
    const users = await db.query(
      `SELECT * FROM users 
       WHERE school_id = ? AND deleted_at IS NULL`,
      [school_id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "School ID not found",
      });
    }

    const user = users[0];

    // Verify password
    const bcrypt = require("bcrypt");
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    // Check if Firebase UID already linked to another account
    const existingFirebaseUser = await db.query(
      `SELECT id, school_id FROM users 
       WHERE firebase_uid = ? AND deleted_at IS NULL`,
      [firebaseUser.uid]
    );

    if (
      existingFirebaseUser.length > 0 &&
      existingFirebaseUser[0].id !== user.id
    ) {
      return res.status(409).json({
        success: false,
        message: "This Firebase account is already linked to another school ID",
      });
    }

    // Check if email matches
    if (user.email && user.email !== firebaseUser.email) {
      return res.status(400).json({
        success: false,
        message:
          "Email mismatch. Firebase email must match your registered email.",
      });
    }

    connection = await db.beginTransaction();

    // Link Firebase account
    await connection.execute(
      `UPDATE users 
       SET firebase_uid = ?, 
           email = ?, 
           email_verified = ?
       WHERE id = ?`,
      [
        firebaseUser.uid,
        firebaseUser.email || null,
        firebaseUser.email_verified ? 1 : 0,
        user.id,
      ]
    );

    await db.commit(connection);

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (
        user_id, action, description, ip_address, status
      ) VALUES (?, 'link_firebase', 'Firebase account linked successfully', ?, 'success')`,
      [user.id, req.ip || "0.0.0.0"]
    );

    logger.info(`Firebase account linked for user ${user.id}`);

    res.json({
      success: true,
      message: "Firebase account linked successfully",
      data: {
        school_id: user.school_id,
        email: firebaseUser.email,
        firebase_linked: true,
      },
    });
  } catch (error) {
    if (connection) {
      await db.rollback(connection);
    }
    logger.error("Link Firebase account error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to link Firebase account",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Login with Firebase
 * POST /api/auth/firebase/login
 *
 * Body: {
 *   firebase_token: "Firebase ID token"
 * }
 */
const loginWithFirebase = async (req, res) => {
  try {
    const { firebase_token } = req.body;

    if (!firebase_token) {
      return res.status(400).json({
        success: false,
        message: "Firebase token is required",
      });
    }

    // Verify Firebase token
    const firebaseUser = await verifyFirebaseToken(firebase_token);

    // Find user by Firebase UID
    const users = await db.query(
      `SELECT * FROM users 
       WHERE firebase_uid = ? AND deleted_at IS NULL`,
      [firebaseUser.uid]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No account linked to this Firebase account. Please link your school ID first.",
        firebase_email: firebaseUser.email,
      });
    }

    const user = users[0];

    // Check account status
    if (user.status !== "active") {
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

    // Generate JWT tokens
    const tokens = generateTokenPair(user);

    // Update user record
    await db.query(
      `UPDATE users 
       SET refresh_token = ?, 
           refresh_token_expires = DATE_ADD(NOW(), INTERVAL 30 DAY),
           last_login = NOW(),
           login_attempts = 0,
           locked_until = NULL
       WHERE id = ?`,
      [tokens.refreshToken, user.id]
    );

    // Log activity
    const ipAddress = req.ip || req.connection?.remoteAddress || "0.0.0.0";
    const userAgent = req.get("user-agent") || "Unknown";

    await db.query(
      `INSERT INTO activity_logs (
        user_id, ip_address, user_agent, action, description, status
      ) VALUES (?, ?, ?, 'login', 'Firebase login successful', 'success')`,
      [user.id, ipAddress, userAgent]
    );

    logger.info(`Firebase login successful for user ${user.id}`);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          school_id: user.school_id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          role: user.role,
          status: user.status,
          firebase_linked: true,
        },
      },
    });
  } catch (error) {
    logger.error("Firebase login error:", error);
    res.status(500).json({
      success: false,
      message: "Firebase login failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Register with Firebase
 * POST /api/auth/firebase/register
 *
 * Body: {
 *   firebase_token: "Firebase ID token",
 *   school_id: "25-1234",
 *   first_name: "John",
 *   last_name: "Doe",
 *   contact_number: "09123456789",
 *   date_of_birth: "2000-01-15",
 *   gender: "male",
 *   address_line1: "123 Main St",
 *   address_line2: "Apt 4B" (optional),
 *   city: "Manila",
 *   province: "Metro Manila",
 *   postal_code: "1000",
 *   emergency_contact_name: "Jane Doe",
 *   emergency_contact_number: "09123456780",
 *   department: "Computer Science",
 *   year_level: "3rd Year"
 * }
 */
const registerWithFirebase = async (req, res) => {
  let connection;

  try {
    const {
      firebase_token,
      school_id,
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

    // Validate required fields
    if (!firebase_token || !school_id || !first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message:
          "Firebase token, school ID, first name, and last name are required",
      });
    }

    if (!contact_number) {
      return res.status(400).json({
        success: false,
        message: "Contact number is required",
      });
    }

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

    // Validate school_id format (XX-XXXXX)
    const schoolIdRegex = /^\d{2}-\d{5}$/;
    if (!schoolIdRegex.test(school_id)) {
      return res.status(400).json({
        success: false,
        message: "School ID must be in format XX-XXXXX (e.g., 23-12345)",
      });
    }

    // Validate name format
    const nameRegex = /^[a-zA-Z\s'-]+$/;
    const trimmedFirstName = first_name.trim();
    const trimmedLastName = last_name.trim();

    if (!nameRegex.test(trimmedFirstName) || trimmedFirstName.length < 2 || trimmedFirstName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "First name must be 2-100 characters and contain only letters, spaces, hyphens, and apostrophes",
      });
    }

    if (!nameRegex.test(trimmedLastName) || trimmedLastName.length < 2 || trimmedLastName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Last name must be 2-100 characters and contain only letters, spaces, hyphens, and apostrophes",
      });
    }

    // Validate contact number (PH mobile format)
    const phMobileRegex = /^(09|\+639)[0-9]{9}$/;
    if (!phMobileRegex.test(contact_number.trim())) {
      return res.status(400).json({
        success: false,
        message: "Contact number must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)",
      });
    }

    // Validate date of birth
    let validatedDob = null;
    const dob = new Date(date_of_birth);
    if (isNaN(dob.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date of birth format. Use YYYY-MM-DD",
      });
    }
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 13 || age > 120) {
      return res.status(400).json({
        success: false,
        message: "Invalid date of birth",
      });
    }
    validatedDob = date_of_birth;

    // Validate gender
    const validGenders = ["male", "female", "other", "prefer_not_to_say"];
    if (!validGenders.includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Invalid gender value. Use: male, female, other, or prefer_not_to_say",
      });
    }

    // Validate emergency contact number
    if (!/^[0-9+\-()\s]{7,20}$/.test(emergency_contact_number)) {
      return res.status(400).json({
        success: false,
        message: "Invalid emergency contact number format",
      });
    }

    // Verify Firebase token
    const firebaseUser = await verifyFirebaseToken(firebase_token);

    // Check if school ID already exists
    const existingSchoolId = await db.query(
      "SELECT id FROM users WHERE school_id = ? AND deleted_at IS NULL",
      [school_id]
    );

    if (existingSchoolId.length > 0) {
      return res.status(409).json({
        success: false,
        message: "School ID already registered",
      });
    }

    // Check if Firebase UID already used
    const existingFirebase = await db.query(
      "SELECT id FROM users WHERE firebase_uid = ? AND deleted_at IS NULL",
      [firebaseUser.uid]
    );

    if (existingFirebase.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This Firebase account is already registered",
      });
    }

    // Check if email already exists
    if (firebaseUser.email) {
      const existingEmail = await db.query(
        "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL",
        [firebaseUser.email]
      );

      if (existingEmail.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email already registered",
        });
      }
    }

    connection = await db.beginTransaction();

    // Generate random password (user won't use it, but column is NOT NULL)
    const bcrypt = require("bcrypt");
    const randomPassword = Math.random().toString(36).slice(-12);
    const password_hash = await bcrypt.hash(randomPassword, 12);

    // Prepare values for insertion (use sanitized values)
    const insertValues = [
      school_id.trim(),
      trimmedFirstName,
      trimmedLastName,
      firebaseUser.email || null,
      contact_number.trim(),
      password_hash,
      validatedDob,
      gender,
      address_line1.trim(),
      address_line2 ? address_line2.trim() : null,
      city.trim(),
      province.trim(),
      postal_code.trim(),
      emergency_contact_name.trim(),
      emergency_contact_number.trim(),
      department.trim(),
      year_level.trim(),
      firebaseUser.uid || null,
      firebaseUser.email_verified ? 1 : 0,
    ];

    // Insert new user
    const result = await connection.execute(
      `INSERT INTO users (
        school_id, first_name, last_name, email, contact_number,
        password_hash, date_of_birth, gender, address_line1, address_line2,
        city, province, postal_code, emergency_contact_name, emergency_contact_number,
        department, year_level, firebase_uid, email_verified, role, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', 'pending')`,
      insertValues
    );

    const userId = result[0].insertId;

    // Generate tokens
    const tempUser = {
      id: userId,
      school_id,
      first_name,
      last_name,
      email: firebaseUser.email,
      role: "user",
      status: "pending",
    };

    const tokens = generateTokenPair(tempUser);

    // Update refresh token
    await connection.execute(
      `UPDATE users 
       SET refresh_token = ?, 
           refresh_token_expires = DATE_ADD(NOW(), INTERVAL 30 DAY)
       WHERE id = ?`,
      [tokens.refreshToken, userId]
    );

    await db.commit(connection);

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (
        user_id, ip_address, action, description, status
      ) VALUES (?, ?, 'register', 'Firebase registration successful', 'success')`,
      [userId, req.ip || "0.0.0.0"]
    );

    logger.info(`New user registered via Firebase: ${userId}`);

    res.status(201).json({
      success: true,
      message: "Registration successful. Awaiting admin approval.",
      data: {
        userId,
        school_id,
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        email: firebaseUser.email,
        contact_number: contact_number.trim(),
        date_of_birth: validatedDob,
        gender,
        address_line1: address_line1.trim(),
        city: city.trim(),
        province: province.trim(),
        department: department.trim(),
        year_level: year_level.trim(),
        status: "pending",
        firebase_linked: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    if (connection) {
      await db.rollback(connection);
    }
    logger.error("Firebase registration error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Unlink Firebase account
 * POST /api/auth/firebase/unlink
 * Requires authentication
 */
const unlinkFirebaseAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user has Firebase linked
    const users = await db.query(
      `SELECT firebase_uid FROM users WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!users[0].firebase_uid) {
      return res.status(400).json({
        success: false,
        message: "No Firebase account is linked",
      });
    }

    // Unlink Firebase
    await db.query(
      `UPDATE users 
       SET firebase_uid = NULL 
       WHERE id = ?`,
      [userId]
    );

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (
        user_id, action, description, ip_address, status
      ) VALUES (?, 'unlink_firebase', 'Firebase account unlinked', ?, 'success')`,
      [userId, req.ip || "0.0.0.0"]
    );

    logger.info(`Firebase account unlinked for user ${userId}`);

    res.json({
      success: true,
      message: "Firebase account unlinked successfully",
    });
  } catch (error) {
    logger.error("Unlink Firebase error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unlink Firebase account",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  linkFirebaseAccount,
  loginWithFirebase,
  registerWithFirebase,
  unlinkFirebaseAccount,
  verifyFirebaseToken,
};
