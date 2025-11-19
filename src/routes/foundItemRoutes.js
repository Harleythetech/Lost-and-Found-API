/**
 * Found Items Routes
 *
 * PUBLIC ROUTES:
 * - GET /api/found-items - List approved found items
 * - GET /api/found-items/:id - View single found item (if approved)
 *
 * AUTHENTICATED ROUTES:
 * - POST /api/found-items - Create found item report
 * - PUT /api/found-items/:id - Update own found item (resets to pending)
 * - DELETE /api/found-items/:id - Delete own found item
 *
 * ADMIN/SECURITY ROUTES:
 * - PATCH /api/found-items/:id/review - Approve/reject found item
 */

const express = require("express");
const router = express.Router();

const foundItemController = require("../controllers/foundItemController");
const { authenticate, authorize, optionalAuth } = require("../middleware/auth");
const {
  foundItemValidation,
  itemSearchValidation,
  approvalValidation,
} = require("../utils/itemValidators");
const { idParamValidation } = require("../utils/validators");
const { upload } = require("../utils/fileUpload");

/**
 * @route   GET /api/found-items
 * @desc    Get all found items (approved for public, all for admin)
 * @access  Public (with optional auth for admin view)
 */
router.get(
  "/",
  optionalAuth,
  itemSearchValidation,
  foundItemController.getFoundItems
);

/**
 * @route   GET /api/found-items/:id
 * @desc    Get single found item
 * @access  Public (if approved) / Owner / Admin
 */
router.get(
  "/:id",
  optionalAuth,
  idParamValidation,
  foundItemController.getFoundItemById
);

/**
 * @route   POST /api/found-items
 * @desc    Create new found item report
 * @access  Private (authenticated users)
 */
router.post(
  "/",
  authenticate,
  upload.array("images", 5), // Max 5 images
  foundItemValidation,
  foundItemController.createFoundItem
);

/**
 * @route   PUT /api/found-items/:id
 * @desc    Update found item (owner only, resets to pending)
 * @access  Private (item owner)
 */
router.put(
  "/:id",
  authenticate,
  idParamValidation,
  foundItemValidation,
  foundItemController.updateFoundItem
);

/**
 * @route   DELETE /api/found-items/:id
 * @desc    Delete found item (soft delete)
 * @access  Private (owner or admin)
 */
router.delete(
  "/:id",
  authenticate,
  idParamValidation,
  foundItemController.deleteFoundItem
);

/**
 * @route   PATCH /api/found-items/:id/review
 * @desc    Approve or reject found item
 * @access  Private (admin/security only)
 */
router.patch(
  "/:id/review",
  authenticate,
  authorize(["admin", "security"]),
  idParamValidation,
  approvalValidation,
  foundItemController.reviewFoundItem
);

module.exports = router;
