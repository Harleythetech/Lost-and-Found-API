/**
 * Authentication Routes
 *
 * PUBLIC ROUTES:
 * - POST /api/auth/register - User registration
 * - POST /api/auth/login - User login
 * - POST /api/auth/firebase/register - Firebase registration
 * - POST /api/auth/firebase/login - Firebase login
 * - POST /api/auth/firebase/link - Link Firebase to existing account
 *
 * PROTECTED ROUTES (require JWT):
 * - GET /api/auth/me - Get current user profile
 * - POST /api/auth/logout - Logout and invalidate tokens
 * - POST /api/auth/firebase/unlink - Unlink Firebase account
 */

const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const firebaseAuthController = require("../controllers/firebaseAuthController");
const { registerValidation, loginValidation } = require("../utils/validators");
const { authenticate } = require("../middleware/auth");
const { authLimiter } = require("../middleware/security");

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 * @rateLimit 5 requests per 15 minutes
 */
router.post(
  "/register",
  authLimiter, // Rate limiting for registration
  registerValidation, // Input validation
  authController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user and get JWT tokens
 * @access  Public
 * @rateLimit 5 requests per 15 minutes
 */
router.post(
  "/login",
  authLimiter, // Rate limiting for login
  loginValidation, // Input validation
  authController.login
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private (requires JWT)
 */
router.get("/me", authenticate, authController.getProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update current user profile
 * @access  Private (requires JWT)
 * @note    school_id and email CANNOT be changed (bound to Firebase)
 */
router.put("/profile", authenticate, authController.updateProfile);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and invalidate refresh token
 * @access  Private (requires JWT)
 */
router.post("/logout", authenticate, authController.logout);

// ==================== Password Reset Routes ====================

const { body, param } = require("express-validator");

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset email
 * @access  Public
 * @body    { email }
 */
router.post(
  "/forgot-password",
  authLimiter,
  [
    body("email")
      .isEmail()
      .withMessage("Valid email is required")
      .normalizeEmail(),
  ],
  authController.forgotPassword
);

/**
 * @route   GET /api/auth/reset-password/:token
 * @desc    Verify password reset token
 * @access  Public
 */
router.get(
  "/reset-password/:token",
  [
    param("token")
      .isLength({ min: 64, max: 64 })
      .withMessage("Invalid token format"),
  ],
  authController.verifyResetToken
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 * @body    { token, new_password }
 */
router.post(
  "/reset-password",
  authLimiter,
  [
    body("token")
      .trim()
      .isLength({ min: 64, max: 64 })
      .withMessage("Invalid token format")
      .matches(/^[a-f0-9]+$/)
      .withMessage("Invalid token format"),
    body("new_password")
      .isLength({ min: 8, max: 128 })
      .withMessage("Password must be between 8 and 128 characters")
      .matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
      )
      .withMessage(
        "Password must contain uppercase, lowercase, number and special character (@$!%*?&)"
      ),
  ],
  authController.resetPassword
);

// ==================== Firebase Authentication Routes ====================

/**
 * @route   POST /api/auth/firebase/register
 * @desc    Register new user with Firebase
 * @access  Public
 * @rateLimit 5 requests per 15 minutes
 * @body    { firebase_token, school_id, first_name, last_name, contact_number? }
 */
router.post(
  "/firebase/register",
  authLimiter,
  firebaseAuthController.registerWithFirebase
);

/**
 * @route   POST /api/auth/firebase/login
 * @desc    Login with Firebase account
 * @access  Public
 * @rateLimit 5 requests per 15 minutes
 * @body    { firebase_token }
 */
router.post(
  "/firebase/login",
  authLimiter,
  firebaseAuthController.loginWithFirebase
);

/**
 * @route   POST /api/auth/firebase/link
 * @desc    Link Firebase account to existing school ID
 * @access  Public
 * @rateLimit 5 requests per 15 minutes
 * @body    { firebase_token, school_id, password }
 */
router.post(
  "/firebase/link",
  authLimiter,
  firebaseAuthController.linkFirebaseAccount
);

/**
 * @route   POST /api/auth/firebase/unlink
 * @desc    Unlink Firebase account from school ID
 * @access  Private (requires JWT)
 */
router.post(
  "/firebase/unlink",
  authenticate,
  firebaseAuthController.unlinkFirebaseAccount
);

// ==================== Admin User Management Routes ====================

const { authorize } = require("../middleware/auth");

/**
 * @route   POST /api/auth/users/:userId/manage
 * @desc    Manage user status (approve, decline, suspend, unsuspend)
 * @access  Private (Admin only)
 * @body    { action: 'approve|decline|suspend|unsuspend', reason?: string, duration_days?: number }
 */
router.post(
  "/users/:userId/manage",
  authenticate,
  authorize(["admin"]),
  authController.manage_user
);

module.exports = router;
