/**
 * Search Routes
 * Handles search endpoints for lost and found items
 */

const express = require("express");
const router = express.Router();
const searchController = require("../controllers/searchController");
const { optionalAuth } = require("../middleware/auth");
const { query } = require("express-validator");

/**
 * Search validation
 */
const searchValidation = [
  query("q")
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Search query must be between 1 and 255 characters"),

  query("category_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Category ID must be a positive integer"),

  query("location_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Location ID must be a positive integer"),

  query("lost_location_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Lost location ID must be a positive integer"),

  query("found_location_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Found location ID must be a positive integer"),

  query("storage_location_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Storage location ID must be a positive integer"),

  query("date_from")
    .optional()
    .isISO8601()
    .withMessage("Date from must be a valid date (YYYY-MM-DD)"),

  query("date_to")
    .optional()
    .isISO8601()
    .withMessage("Date to must be a valid date (YYYY-MM-DD)"),

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
      "available",
    ])
    .withMessage("Invalid status"),

  query("page")
    .optional()
    .toInt()
    .custom((value) => value >= 1)
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .toInt()
    .custom((value) => value >= 1 && value <= 100)
    .withMessage("Limit must be between 1 and 100"),
];

// Search lost items (public - shows approved only, admin/security sees all)
router.get(
  "/lost",
  optionalAuth,
  searchValidation,
  searchController.searchLostItems
);

// Search found items (public - shows approved only, admin/security sees all)
router.get(
  "/found",
  optionalAuth,
  searchValidation,
  searchController.searchFoundItems
);

// Search both lost and found items (public - shows approved only, admin/security sees all)
router.get("/all", optionalAuth, searchValidation, searchController.searchAll);

module.exports = router;
