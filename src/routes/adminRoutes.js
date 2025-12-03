/**
 * Admin Dashboard Routes
 * Admin-only endpoints for system management
 *
 * All routes require authentication + admin role
 */

const express = require("express");
const router = express.Router();
const { query, param, body } = require("express-validator");
const adminController = require("../controllers/adminController");
const { authenticate, authorize } = require("../middleware/auth");

// ============================================
// MIDDLEWARE - All routes require admin auth
// ============================================
router.use(authenticate);
router.use(authorize(["admin"]));

// ============================================
// VALIDATION RULES
// ============================================

const paginationValidation = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),
];

const userSearchValidation = [
  ...paginationValidation,
  query("status")
    .optional()
    .isIn(["active", "pending", "suspended"])
    .withMessage("Invalid status"),
  query("role")
    .optional()
    .isIn(["user", "security", "admin"])
    .withMessage("Invalid role"),
  query("search")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Search term too long"),
];

const itemSearchValidation = [
  ...paginationValidation,
  query("status")
    .optional()
    .isIn([
      "pending",
      "approved",
      "rejected",
      "matched",
      "claimed",
      "resolved",
      "archived",
    ])
    .withMessage("Invalid status"),
  query("category_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid category ID")
    .toInt(),
  query("search")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Search term too long"),
];

const pendingFilterValidation = [
  query("type")
    .optional()
    .isIn(["users", "lost", "found", "claims"])
    .withMessage("Invalid type filter"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),
];

const activityFilterValidation = [
  query("action")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Action filter too long"),
  query("user_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid user ID")
    .toInt(),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage("Limit must be between 1 and 200")
    .toInt(),
];

const idParamValidation = [
  param("id").isInt({ min: 1 }).withMessage("Invalid ID").toInt(),
];

const roleUpdateValidation = [
  ...idParamValidation,
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["user", "security", "admin"])
    .withMessage("Invalid role. Must be: user, security, or admin"),
];

const trendsValidation = [
  query("days")
    .optional()
    .isInt({ min: 7, max: 90 })
    .withMessage("Days must be between 7 and 90")
    .toInt(),
];

// ============================================
// DASHBOARD OVERVIEW
// ============================================

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard overview with key metrics
 * @access  Private (Admin only)
 */
router.get("/dashboard", adminController.getDashboardOverview);

/**
 * @route   GET /api/admin/pending
 * @desc    Get all pending items requiring review
 * @access  Private (Admin only)
 * @query   type - Filter by type (users, lost, found, claims)
 * @query   limit - Number of items per type (default: 20)
 */
router.get(
  "/pending",
  pendingFilterValidation,
  adminController.getPendingItems
);

// ============================================
// USER MANAGEMENT
// ============================================

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with filtering and pagination
 * @access  Private (Admin only)
 */
router.get("/users", userSearchValidation, adminController.getUsers);

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get single user details with history
 * @access  Private (Admin only)
 */
router.get("/users/:id", idParamValidation, adminController.getUserById);

/**
 * @route   PATCH /api/admin/users/:id/role
 * @desc    Update user role (promote/demote)
 * @access  Private (Admin only)
 * @body    { role: 'user' | 'security' | 'admin' }
 */
router.patch(
  "/users/:id/role",
  roleUpdateValidation,
  adminController.updateUserRole
);

// ============================================
// ACTIVITY LOGS
// ============================================

/**
 * @route   GET /api/admin/activity
 * @desc    Get system-wide recent activity
 * @access  Private (Admin only)
 */
router.get(
  "/activity",
  activityFilterValidation,
  adminController.getRecentActivity
);

// ============================================
// ITEMS MANAGEMENT (All statuses visible)
// ============================================

/**
 * @route   GET /api/admin/lost-items
 * @desc    Get all lost items (admin view)
 * @access  Private (Admin only)
 */
router.get(
  "/lost-items",
  itemSearchValidation,
  adminController.getAllLostItems
);

/**
 * @route   GET /api/admin/found-items
 * @desc    Get all found items (admin view)
 * @access  Private (Admin only)
 */
router.get(
  "/found-items",
  itemSearchValidation,
  adminController.getAllFoundItems
);

// ============================================
// REPORTS & ANALYTICS
// ============================================

/**
 * @route   GET /api/admin/reports/by-category
 * @desc    Get item statistics grouped by category
 * @access  Private (Admin only)
 */
router.get("/reports/by-category", adminController.getStatsByCategory);

/**
 * @route   GET /api/admin/reports/by-location
 * @desc    Get item statistics grouped by location
 * @access  Private (Admin only)
 */
router.get("/reports/by-location", adminController.getStatsByLocation);

/**
 * @route   GET /api/admin/reports/trends
 * @desc    Get time-based trends (daily stats)
 * @access  Private (Admin only)
 * @query   days - Number of days to look back (default: 30, max: 90)
 */
router.get("/reports/trends", trendsValidation, adminController.getTrends);

module.exports = router;
