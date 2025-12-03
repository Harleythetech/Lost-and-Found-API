/**
 * Dashboard Routes
 * User dashboard endpoints for items, claims, matches, and stats
 */

const express = require("express");
const router = express.Router();
const { body, query } = require("express-validator");
const dashboardController = require("../controllers/dashboardController");
const { authenticate } = require("../middleware/auth");

// All dashboard routes require authentication
router.use(authenticate);

// ============================================
// VALIDATION RULES
// ============================================

const profileUpdateValidation = [
  body("first_name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("First name must be 2-100 characters")
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage(
      "First name can only contain letters, spaces, hyphens, and apostrophes"
    ),
  body("last_name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Last name must be 2-100 characters")
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage(
      "Last name can only contain letters, spaces, hyphens, and apostrophes"
    ),
  body("contact_number")
    .optional()
    .trim()
    .matches(/^(09|\+639)[0-9]{9}$/)
    .withMessage(
      "Contact number must be a valid PH mobile (09XXXXXXXXX or +639XXXXXXXXX)"
    ),
  body("date_of_birth")
    .optional()
    .isISO8601()
    .withMessage("Date of birth must be in YYYY-MM-DD format"),
  body("gender")
    .optional()
    .isIn(["male", "female", "other", "prefer_not_to_say"])
    .withMessage("Invalid gender value"),
  body("address_line1")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Address must be less than 255 characters"),
  body("address_line2")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Address line 2 must be less than 255 characters"),
  body("city")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("City must be less than 100 characters"),
  body("province")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Province must be less than 100 characters"),
  body("postal_code")
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage("Postal code must be less than 20 characters"),
  body("emergency_contact_name")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Emergency contact name must be less than 200 characters"),
  body("emergency_contact_number")
    .optional()
    .trim()
    .matches(/^[0-9+\-()\s]{7,20}$/)
    .withMessage("Invalid emergency contact number format"),
  body("department")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Department must be less than 100 characters"),
  body("year_level")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Year level must be less than 50 characters"),
];

const passwordChangeValidation = [
  body("current_password")
    .notEmpty()
    .withMessage("Current password is required"),
  body("new_password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      "Password must contain uppercase, lowercase, number and special character (@$!%*?&)"
    ),
];

const paginationValidation = [
  query("status")
    .optional()
    .trim()
    .isIn([
      "pending",
      "approved",
      "rejected",
      "matched",
      "resolved",
      "archived",
      "claimed",
      "cancelled",
    ])
    .withMessage("Invalid status"),
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

// ============================================
// OVERVIEW & STATS
// ============================================

// Get dashboard overview with all stats
router.get("/", dashboardController.getDashboardStats);

// Get user profile summary
router.get("/profile", dashboardController.getProfileSummary);

// Update user profile
router.put(
  "/profile",
  profileUpdateValidation,
  dashboardController.updateProfile
);

// Change password
router.put(
  "/profile/password",
  passwordChangeValidation,
  dashboardController.changePassword
);

// Get recent activity feed
router.get("/activity", dashboardController.getRecentActivity);

// ============================================
// USER'S ITEMS
// ============================================

// Get user's lost items
router.get(
  "/my-lost-items",
  paginationValidation,
  dashboardController.getMyLostItems
);

// Get user's found items
router.get(
  "/my-found-items",
  paginationValidation,
  dashboardController.getMyFoundItems
);

// ============================================
// CLAIMS
// ============================================

// Get user's claims (claims they made)
router.get("/my-claims", paginationValidation, dashboardController.getMyClaims);

// Get claims on user's found items (claims others made on their items)
router.get(
  "/claims-on-my-items",
  paginationValidation,
  dashboardController.getClaimsOnMyItems
);

// ============================================
// MATCHES
// ============================================

// Get matches for user's items
router.get(
  "/my-matches",
  paginationValidation,
  dashboardController.getMyMatches
);

module.exports = router;
