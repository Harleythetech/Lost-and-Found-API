/**
 * Category & Location Validation Schemas
 */

const { body } = require("express-validator");

/**
 * Category Validation
 */
const categoryValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Category name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Category name must be between 2 and 100 characters")
    .escape(),

  body("description")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must not exceed 500 characters")
    .escape(),

  body("icon")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("Icon name must not exceed 50 characters")
    .matches(/^[a-z0-9-]+$/)
    .withMessage(
      "Icon name can only contain lowercase letters, numbers, and hyphens"
    ),

  body("is_active")
    .optional()
    .isBoolean()
    .withMessage("is_active must be true or false")
    .toBoolean(),
];

/**
 * Location Validation
 */
const locationValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Location name is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Location name must be between 2 and 150 characters")
    .escape(),

  body("building")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Building name must not exceed 100 characters")
    .escape(),

  body("floor")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage("Floor must not exceed 20 characters")
    .escape(),

  body("description")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must not exceed 500 characters")
    .escape(),

  body("is_storage")
    .optional()
    .isBoolean()
    .withMessage("is_storage must be true or false")
    .toBoolean(),

  body("is_active")
    .optional()
    .isBoolean()
    .withMessage("is_active must be true or false")
    .toBoolean(),
];

module.exports = {
  categoryValidation,
  locationValidation,
};
