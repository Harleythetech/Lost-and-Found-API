/**
 * Claims Routes
 * Handles claim submissions and verification for found items
 */

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const { authenticate, authorize } = require("../middleware/auth");
const { upload } = require("../utils/fileUpload");
const claimsController = require("../controllers/claimsController");

// ============================================
// VALIDATION RULES
// ============================================

const submitClaimValidation = [
  body("found_item_id")
    .notEmpty()
    .withMessage("Found item ID is required")
    .isInt({ min: 1 })
    .withMessage("Invalid found item ID"),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description is required")
    .isLength({ min: 20, max: 1000 })
    .withMessage("Description must be 20-1000 characters"),

  body("proof_details")
    .trim()
    .notEmpty()
    .withMessage("Proof details are required")
    .isLength({ min: 20, max: 2000 })
    .withMessage(
      "Proof details must be 20-2000 characters. Describe unique features, serial numbers, or other identifying information."
    ),
];

const verifyClaimValidation = [
  body("action")
    .notEmpty()
    .withMessage("Action is required")
    .isIn(["approve", "reject"])
    .withMessage('Action must be "approve" or "reject"'),

  body("verification_notes")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Verification notes must be under 1000 characters"),

  body("rejection_reason")
    .if(body("action").equals("reject"))
    .notEmpty()
    .withMessage("Rejection reason is required when rejecting")
    .isLength({ min: 10, max: 500 })
    .withMessage("Rejection reason must be 10-500 characters"),

  body("pickup_scheduled")
    .optional()
    .isISO8601()
    .withMessage("Invalid date format for pickup schedule"),
];

const pickupValidation = [
  body("picked_up_by_name")
    .trim()
    .notEmpty()
    .withMessage("Name of person picking up is required")
    .isLength({ min: 2, max: 200 })
    .withMessage("Name must be 2-200 characters"),

  body("id_presented")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("ID number must be under 100 characters"),
];

const idParamValidation = [
  param("id").isInt({ min: 1 }).withMessage("Invalid claim ID"),
];

const itemIdParamValidation = [
  param("itemId").isInt({ min: 1 }).withMessage("Invalid item ID"),
];

// ============================================
// ROUTES
// ============================================

/**
 * @route   POST /api/claims
 * @desc    Submit a claim for a found item
 * @access  Private (authenticated users)
 *
 * @example
 * POST /api/claims
 * Content-Type: multipart/form-data
 *
 * {
 *   "found_item_id": 1,
 *   "description": "This is my laptop that I lost last week in the library",
 *   "proof_details": "It has a blue case with stickers. Serial number: ABC123. My name is engraved on the bottom."
 * }
 * + images[] (optional proof images)
 */
router.post(
  "/",
  authenticate,
  upload.array("images", 5),
  submitClaimValidation,
  claimsController.submitClaim
);

/**
 * @route   GET /api/claims
 * @desc    Get all claims (admin sees all, users see their own)
 * @access  Private
 *
 * @query   status - filter by: pending, approved, rejected, cancelled
 * @query   page - page number (default: 1)
 * @query   limit - items per page (default: 10)
 *
 * @example GET /api/claims?status=pending&page=1&limit=10
 */
router.get(
  "/",
  authenticate,
  [
    query("status")
      .optional()
      .isIn([
        "all",
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "completed",
      ])
      .withMessage("Invalid status filter"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be 1-50"),
  ],
  claimsController.getClaims
);

/**
 * @route   GET /api/claims/:id
 * @desc    Get single claim details
 * @access  Private (claim owner or admin)
 *
 * @example GET /api/claims/1
 */
router.get(
  "/:id",
  authenticate,
  idParamValidation,
  claimsController.getClaimById
);

/**
 * @route   GET /api/claims/item/:itemId
 * @desc    Get all claims for a specific found item
 * @access  Private (item owner or admin)
 *
 * @example GET /api/claims/item/5
 */
router.get(
  "/item/:itemId",
  authenticate,
  itemIdParamValidation,
  claimsController.getClaimsByItem
);

/**
 * @route   PATCH /api/claims/:id/verify
 * @desc    Approve or reject a claim
 * @access  Private (admin/security only)
 *
 * @example
 * PATCH /api/claims/1/verify
 * {
 *   "action": "approve",
 *   "verification_notes": "Verified ownership via serial number match",
 *   "pickup_scheduled": "2025-12-05T10:00:00Z"
 * }
 *
 * OR for rejection:
 * {
 *   "action": "reject",
 *   "rejection_reason": "Description does not match the item"
 * }
 */
router.patch(
  "/:id/verify",
  authenticate,
  authorize(["admin", "security"]),
  idParamValidation,
  verifyClaimValidation,
  claimsController.verifyClaim
);

/**
 * @route   PATCH /api/claims/:id/schedule
 * @desc    Schedule pickup for an approved claim
 * @access  Private (admin/security only)
 *
 * @example
 * PATCH /api/claims/1/schedule
 * { "pickup_scheduled": "2025-12-05T14:00:00Z" }
 */
router.patch(
  "/:id/schedule",
  authenticate,
  authorize(["admin", "security"]),
  idParamValidation,
  [
    body("pickup_scheduled")
      .notEmpty()
      .withMessage("Pickup date/time is required")
      .isISO8601()
      .withMessage("Invalid date format"),
  ],
  claimsController.schedulePickup
);

/**
 * @route   PATCH /api/claims/:id/pickup
 * @desc    Record that the item has been picked up
 * @access  Private (admin/security only)
 *
 * @example
 * PATCH /api/claims/1/pickup
 * {
 *   "picked_up_by_name": "Juan Dela Cruz",
 *   "id_presented": "2023-12345"
 * }
 */
router.patch(
  "/:id/pickup",
  authenticate,
  authorize(["admin", "security"]),
  idParamValidation,
  pickupValidation,
  claimsController.recordPickup
);

/**
 * @route   PATCH /api/claims/:id/cancel
 * @desc    Cancel a pending claim (by claim owner only)
 * @access  Private (claim owner)
 *
 * @example PATCH /api/claims/1/cancel
 */
router.patch(
  "/:id/cancel",
  authenticate,
  idParamValidation,
  claimsController.cancelClaim
);

module.exports = router;
