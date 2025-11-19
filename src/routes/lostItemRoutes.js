/**
 * Lost Items Routes
 *
 * PUBLIC ROUTES:
 * - GET /api/lost-items - List approved lost items
 * - GET /api/lost-items/:id - View single lost item (if approved)
 *
 * AUTHENTICATED ROUTES:
 * - POST /api/lost-items - Create lost item report
 * - PUT /api/lost-items/:id - Update own lost item (resets to pending)
 * - DELETE /api/lost-items/:id - Delete own lost item
 *
 * ADMIN/SECURITY ROUTES:
 * - PATCH /api/lost-items/:id/review - Approve/reject lost item
 */

const express = require("express");
const router = express.Router();

const lostItemController = require("../controllers/lostItemController");
const { authenticate, authorize, optionalAuth } = require("../middleware/auth");
const {
  lostItemValidation,
  itemSearchValidation,
  approvalValidation,
} = require("../utils/itemValidators");
const { idParamValidation } = require("../utils/validators");
const { upload } = require("../utils/fileUpload");

/**
 * @route   GET /api/lost-items
 * @desc    Get all lost items (approved for public, all for admin)
 * @access  Public (with optional auth for admin view)
 */
router.get(
  "/",
  optionalAuth, // Optional - shows all items if admin
  itemSearchValidation,
  lostItemController.getLostItems
);

/**
 * @route   GET /api/lost-items/:id
 * @desc    Get single lost item
 * @access  Public (if approved) / Owner / Admin
 */
router.get(
  "/:id",
  optionalAuth,
  idParamValidation,
  lostItemController.getLostItemById
);

/**
 * @route   POST /api/lost-items
 * @desc    Create new lost item report
 * @access  Private (authenticated users)
 */
router.post(
  "/",
  authenticate,
  upload.array("images", 5), // Max 5 images
  lostItemValidation,
  lostItemController.createLostItem
);

/**
 * @route   PUT /api/lost-items/:id
 * @desc    Update lost item (owner only, resets to pending)
 * @access  Private (item owner)
 */
router.put(
  "/:id",
  authenticate,
  idParamValidation,
  lostItemValidation,
  lostItemController.updateLostItem
);

/**
 * @route   DELETE /api/lost-items/:id
 * @desc    Delete lost item (soft delete)
 * @access  Private (owner or admin)
 */
router.delete(
  "/:id",
  authenticate,
  idParamValidation,
  lostItemController.deleteLostItem
);

/**
 * @route   PATCH /api/lost-items/:id/review
 * @desc    Approve or reject lost item
 * @access  Private (admin/security only)
 */
router.patch(
  "/:id/review",
  authenticate,
  authorize(["admin", "security"]),
  idParamValidation,
  approvalValidation,
  lostItemController.reviewLostItem
);

module.exports = router;
