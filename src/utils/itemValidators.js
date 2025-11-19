/**
 * Item Validation Schemas
 * Validation for lost and found item reports
 */

const { body, param, query } = require("express-validator");

/**
 * Lost Item Creation/Update Validation
 */
const lostItemValidation = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ min: 5, max: 255 })
    .withMessage("Title must be between 5 and 255 characters")
    .escape(),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description is required")
    .isLength({ min: 20, max: 2000 })
    .withMessage("Description must be between 20 and 2000 characters")
    .escape(),

  body("category_id")
    .isInt({ min: 1 })
    .withMessage("Valid category is required")
    .toInt(),

  body("last_seen_location_id")
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Invalid location")
    .toInt(),

  body("last_seen_date")
    .notEmpty()
    .withMessage("Last seen date is required")
    .isISO8601()
    .withMessage("Invalid date format")
    .toDate()
    .custom((value) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (value > today) {
        throw new Error("Last seen date cannot be in the future");
      }
      return true;
    }),

  body("last_seen_time")
    .optional({ checkFalsy: true })
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/)
    .withMessage("Invalid time format (HH:MM or HH:MM:SS)"),

  body("unique_identifiers")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Unique identifiers must not exceed 1000 characters")
    .escape(),

  body("reward_offered")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 999999.99 })
    .withMessage("Reward must be between 0 and 999,999.99")
    .toFloat(),

  body("contact_via_email")
    .optional()
    .isBoolean()
    .withMessage("Must be true or false")
    .toBoolean(),

  body("contact_via_phone")
    .optional()
    .isBoolean()
    .withMessage("Must be true or false")
    .toBoolean(),
];

/**
 * Found Item Creation/Update Validation
 */
const foundItemValidation = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ min: 5, max: 255 })
    .withMessage("Title must be between 5 and 255 characters")
    .escape(),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description is required")
    .isLength({ min: 20, max: 2000 })
    .withMessage("Description must be between 20 and 2000 characters")
    .escape(),

  body("category_id")
    .isInt({ min: 1 })
    .withMessage("Valid category is required")
    .toInt(),

  body("found_location_id")
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Invalid location")
    .toInt(),

  body("found_date")
    .notEmpty()
    .withMessage("Found date is required")
    .isISO8601()
    .withMessage("Invalid date format")
    .toDate()
    .custom((value) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (value > today) {
        throw new Error("Found date cannot be in the future");
      }
      return true;
    }),

  body("found_time")
    .optional({ checkFalsy: true })
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/)
    .withMessage("Invalid time format (HH:MM or HH:MM:SS)"),

  body("storage_location_id")
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Invalid storage location")
    .toInt(),

  body("storage_notes")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Storage notes must not exceed 1000 characters")
    .escape(),

  body("turned_in_to_security")
    .optional()
    .isBoolean()
    .withMessage("Must be true or false")
    .toBoolean(),

  body("unique_identifiers")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Unique identifiers must not exceed 1000 characters")
    .escape(),

  body("condition_notes")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Condition notes must not exceed 1000 characters")
    .escape(),
];

/**
 * Item Search/Filter Validation
 */
const itemSearchValidation = [
  query("search")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Search query must be between 2 and 100 characters"),

  query("category_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid category ID")
    .toInt(),

  query("location_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid location ID")
    .toInt(),

  query("status")
    .optional()
    .isIn([
      "pending",
      "approved",
      "rejected",
      "matched",
      "resolved",
      "archived",
    ])
    .withMessage("Invalid status"),

  query("date_from")
    .optional()
    .isISO8601()
    .withMessage("Invalid date format")
    .toDate(),

  query("date_to")
    .optional()
    .isISO8601()
    .withMessage("Invalid date format")
    .toDate(),

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

/**
 * Admin Approval/Rejection Validation
 */
const approvalValidation = [
  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(["approved", "rejected"])
    .withMessage("Status must be either 'approved' or 'rejected'"),

  body("rejection_reason")
    .if(body("status").equals("rejected"))
    .notEmpty()
    .withMessage("Rejection reason is required when rejecting")
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Rejection reason must be between 10 and 500 characters")
    .escape(),
];

module.exports = {
  lostItemValidation,
  foundItemValidation,
  itemSearchValidation,
  approvalValidation,
};
