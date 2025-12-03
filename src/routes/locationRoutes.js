/**
 * Locations Routes
 */

const express = require("express");
const router = express.Router();
const { query } = require("express-validator");

const locationsController = require("../controllers/locationsController");
const { authenticate, authorize } = require("../middleware/auth");
const { locationValidation } = require("../utils/referenceValidators");
const { idParamValidation } = require("../utils/validators");

// Query validation for GET locations
const getLocationsValidation = [
  query("active_only")
    .optional()
    .isIn(["true", "false"])
    .withMessage("active_only must be true or false"),
  query("storage_only")
    .optional()
    .isIn(["true", "false"])
    .withMessage("storage_only must be true or false"),
];

/**
 * @route   GET /api/locations
 * @desc    Get all locations
 * @access  Public
 */
router.get("/", getLocationsValidation, locationsController.getLocations);

/**
 * @route   GET /api/locations/:id
 * @desc    Get single location
 * @access  Public
 */
router.get("/:id", idParamValidation, locationsController.getLocationById);

/**
 * @route   POST /api/locations
 * @desc    Create new location
 * @access  Admin only
 */
router.post(
  "/",
  authenticate,
  authorize(["admin"]),
  locationValidation,
  locationsController.createLocation
);

/**
 * @route   PUT /api/locations/:id
 * @desc    Update location
 * @access  Admin only
 */
router.put(
  "/:id",
  authenticate,
  authorize(["admin"]),
  idParamValidation,
  locationValidation,
  locationsController.updateLocation
);

/**
 * @route   DELETE /api/locations/:id
 * @desc    Delete location
 * @access  Admin only
 */
router.delete(
  "/:id",
  authenticate,
  authorize(["admin"]),
  idParamValidation,
  locationsController.deleteLocation
);

/**
 * @route   PATCH /api/locations/:id/toggle
 * @desc    Toggle location active status
 * @access  Admin only
 */
router.patch(
  "/:id/toggle",
  authenticate,
  authorize(["admin"]),
  idParamValidation,
  locationsController.toggleLocationStatus
);

module.exports = router;
