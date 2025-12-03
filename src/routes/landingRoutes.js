/**
 * Landing Routes
 * Public landing/home page endpoints - display only
 *
 * These endpoints are purely for display purposes.
 * No search, no view details, no view all functionality.
 */

const express = require("express");
const router = express.Router();
const landingController = require("../controllers/landingController");

/**
 * @route   GET /api/landing
 * @desc    Get landing page data (recent items for display)
 * @access  Public
 *
 * Returns:
 * - 6 recent approved lost items
 * - 6 recent approved found items
 * - Basic stats (total lost, total found, total resolved)
 *
 * No search, no filtering, no pagination - purely for display
 */
router.get("/", landingController.getLandingItems);

/**
 * @route   GET /api/landing/categories
 * @desc    Get active categories for landing page
 * @access  Public
 */
router.get("/categories", landingController.getLandingCategories);

module.exports = router;
