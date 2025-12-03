/**
 * Notifications Routes
 * Handles notification management and email preferences
 */

const express = require("express");
const router = express.Router();
const { param, query, body } = require("express-validator");
const notificationsController = require("../controllers/notificationsController");
const { authenticate } = require("../middleware/auth");

// ============================================
// VALIDATION RULES
// ============================================

const getNotificationsValidation = [
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
  query("unread_only")
    .optional()
    .isIn(["true", "false"])
    .withMessage("unread_only must be true or false"),
  query("type")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Type must be less than 50 characters")
    .matches(/^[a-z_]+$/)
    .withMessage("Invalid notification type format"),
];

const idParamValidation = [
  param("id").isInt({ min: 1 }).withMessage("Invalid notification ID").toInt(),
];

const tokenParamValidation = [
  param("token")
    .notEmpty()
    .withMessage("Token is required")
    .isBase64()
    .withMessage("Invalid token format"),
];

const updatePreferencesValidation = [
  body("email_notifications")
    .isBoolean()
    .withMessage("email_notifications must be a boolean"),
];

// ============================================
// PUBLIC ROUTES (for email unsubscribe links)
// ============================================

// Unsubscribe via email link
router.get(
  "/unsubscribe/:token",
  tokenParamValidation,
  notificationsController.unsubscribeByToken
);

// ============================================
// PROTECTED ROUTES
// ============================================

// Apply authentication to all routes below
router.use(authenticate);

// Get notifications
router.get(
  "/",
  getNotificationsValidation,
  notificationsController.getNotifications
);

// Get unread count (for badge/icon)
router.get("/unread-count", notificationsController.getUnreadCount);

// Get email preferences
router.get("/preferences", notificationsController.getPreferences);

// Update email preferences
router.patch(
  "/preferences",
  updatePreferencesValidation,
  notificationsController.updatePreferences
);

// Mark all as read
router.patch("/read-all", notificationsController.markAllAsRead);

// Mark single notification as read
router.patch(
  "/:id/read",
  idParamValidation,
  notificationsController.markAsRead
);

// Delete all read notifications
router.delete("/clear-read", notificationsController.clearReadNotifications);

// Delete single notification
router.delete(
  "/:id",
  idParamValidation,
  notificationsController.deleteNotification
);

module.exports = router;
