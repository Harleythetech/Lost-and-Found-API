/**
 * Authentication Routes
 *
 * PUBLIC ROUTES:
 * - POST /api/auth/register - User registration
 * - POST /api/auth/login - User login
 *
 * PROTECTED ROUTES (require JWT):
 * - GET /api/auth/me - Get current user profile
 * - POST /api/auth/logout - Logout and invalidate tokens
 */

const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
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
 * @route   POST /api/auth/logout
 * @desc    Logout user and invalidate refresh token
 * @access  Private (requires JWT)
 */
router.post("/logout", authenticate, authController.logout);

module.exports = router;
