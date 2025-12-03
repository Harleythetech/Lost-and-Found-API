/**
 * Matching Routes
 */

const express = require("express");
const router = express.Router();
const { param, body, query } = require("express-validator");

const matchingController = require("../controllers/matchingController");
const { authenticate, authorize } = require("../middleware/auth");
const { idParamValidation } = require("../utils/validators");

// Validation for itemType parameter
const itemTypeValidation = [
  param("itemType")
    .isIn(["lost", "found"])
    .withMessage("Item type must be 'lost' or 'found'"),
  param("itemId")
    .isInt({ min: 1 })
    .withMessage("Item ID must be a positive integer")
    .toInt(),
  query("status")
    .optional()
    .isIn(["suggested", "confirmed", "dismissed"])
    .withMessage("Status must be 'suggested', 'confirmed', or 'dismissed'"),
];

/**
 * @route   GET /api/matches/lost/:id
 * @desc    Find potential matches for a lost item
 * @access  Private (item owner or admin)
 */
router.get(
  "/lost/:id",
  authenticate,
  idParamValidation,
  matchingController.getMatchesForLostItem
);

/**
 * @route   GET /api/matches/found/:id
 * @desc    Find potential matches for a found item
 * @access  Private (item owner or admin)
 */
router.get(
  "/found/:id",
  authenticate,
  idParamValidation,
  matchingController.getMatchesForFoundItem
);

/**
 * @route   GET /api/matches/my-lost-items
 * @desc    Get all matches for user's lost items
 * @access  Private (authenticated user)
 */
router.get(
  "/my-lost-items",
  authenticate,
  matchingController.getMyLostItemMatches
);

/**
 * @route   POST /api/matches/:id/accept
 * @desc    Accept a match (confirm this is your item)
 * @access  Private (lost item owner)
 */
router.post(
  "/:id/accept",
  authenticate,
  idParamValidation,
  matchingController.acceptMatch
);

/**
 * @route   POST /api/matches/:id/reject
 * @desc    Reject a match (not your item)
 * @access  Private (lost item owner)
 */
router.post(
  "/:id/reject",
  authenticate,
  idParamValidation,
  matchingController.rejectMatch
);

/**
 * @route   GET /api/matches/saved/:itemType/:itemId
 * @desc    Get saved matches for an item
 * @access  Private (item owner or admin)
 */
router.get(
  "/saved/:itemType/:itemId",
  authenticate,
  itemTypeValidation,
  matchingController.getSavedMatches
);

/**
 * @route   PATCH /api/matches/:matchId/status
 * @desc    Update match status (suggested/confirmed/dismissed)
 * @access  Private (item owner or admin)
 */
router.patch(
  "/:matchId/status",
  authenticate,
  [
    param("matchId")
      .isInt({ min: 1 })
      .withMessage("Match ID must be a positive integer")
      .toInt(),
    body("status")
      .notEmpty()
      .withMessage("Status is required")
      .isIn(["suggested", "confirmed", "dismissed"])
      .withMessage("Status must be 'suggested', 'confirmed', or 'dismissed'"),
  ],
  matchingController.updateMatchStatus
);

/**
 * @route   POST /api/matches/run-auto-match
 * @desc    Run automatic matching for all items
 * @access  Admin only
 */
router.post(
  "/run-auto-match",
  authenticate,
  authorize(["admin"]),
  matchingController.runAutoMatching
);

module.exports = router;
