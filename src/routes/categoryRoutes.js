/**
 * Categories Routes
 */

const express = require("express");
const router = express.Router();
const { query } = require("express-validator");

const categoriesController = require("../controllers/categoriesController");
const { authenticate, authorize, optionalAuth } = require("../middleware/auth");
const { categoryValidation } = require("../utils/referenceValidators");
const { idParamValidation } = require("../utils/validators");

// Query validation for GET categories
const getCategoriesValidation = [
  query("active_only")
    .optional()
    .isIn(["true", "false"])
    .withMessage("active_only must be true or false"),
];

/**
 * @route   GET /api/categories
 * @desc    Get all categories
 * @access  Public (active only) / Admin (all categories)
 */
router.get(
  "/",
  optionalAuth,
  getCategoriesValidation,
  categoriesController.getCategories
);

/**
 * @route   GET /api/categories/:id
 * @desc    Get single category
 * @access  Public
 */
router.get("/:id", idParamValidation, categoriesController.getCategoryById);

/**
 * @route   POST /api/categories
 * @desc    Create new category
 * @access  Admin only
 */
router.post(
  "/",
  authenticate,
  authorize(["admin"]),
  categoryValidation,
  categoriesController.createCategory
);

/**
 * @route   PUT /api/categories/:id
 * @desc    Update category
 * @access  Admin only
 */
router.put(
  "/:id",
  authenticate,
  authorize(["admin"]),
  idParamValidation,
  categoryValidation,
  categoriesController.updateCategory
);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete category
 * @access  Admin only
 */
router.delete(
  "/:id",
  authenticate,
  authorize(["admin"]),
  idParamValidation,
  categoriesController.deleteCategory
);

/**
 * @route   PATCH /api/categories/:id/toggle
 * @desc    Toggle category active status
 * @access  Admin only
 */
router.patch(
  "/:id/toggle",
  authenticate,
  authorize(["admin"]),
  idParamValidation,
  categoriesController.toggleCategoryStatus
);

module.exports = router;
