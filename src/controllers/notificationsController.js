/**
 * Notifications Controller
 * Handles in-app notifications and email preferences
 *
 * FEATURES:
 * - Get user notifications (paginated)
 * - Mark notifications as read
 * - Get unread count
 * - Manage email preferences (subscribe/unsubscribe)
 * - Delete notifications
 */

const db = require("../config/database");
const logger = require("../utils/logger");

/**
 * @desc    Get user's notifications
 * @route   GET /api/notifications
 * @access  Private
 *
 * @query   page - page number (default: 1)
 * @query   limit - items per page (default: 20)
 * @query   unread_only - only show unread (default: false)
 * @query   type - filter by notification type
 */
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unread_only, type } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "user_id = ?";
    const params = [userId];

    // Filter unread only
    if (unread_only === "true") {
      whereClause += " AND is_read = 0";
    }

    // Filter by type
    if (type) {
      whereClause += " AND type = ?";
      params.push(type);
    }

    // Exclude expired notifications
    whereClause += " AND (expires_at IS NULL OR expires_at > NOW())";

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM notifications WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get notifications
    const notifications = await db.query(
      `SELECT 
        id,
        type,
        title,
        message,
        related_item_type,
        related_item_id,
        is_read,
        read_at,
        action_url,
        created_at,
        expires_at
       FROM notifications 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Get notifications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};

/**
 * @desc    Get unread notification count
 * @route   GET /api/notifications/unread-count
 * @access  Private
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT COUNT(*) as count 
       FROM notifications 
       WHERE user_id = ? AND is_read = 0 
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        unread_count: result[0].count,
      },
    });
  } catch (error) {
    logger.error("Get unread count error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get unread count",
    });
  }
};

/**
 * @desc    Mark notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check ownership
    const notifications = await db.query(
      "SELECT id, is_read FROM notifications WHERE id = ? AND user_id = ?",
      [id, userId]
    );

    if (notifications.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    if (notifications[0].is_read) {
      return res.json({
        success: true,
        message: "Already marked as read",
      });
    }

    await db.query(
      "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    logger.error("Mark as read error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
    });
  }
};

/**
 * @desc    Mark all notifications as read
 * @route   PATCH /api/notifications/read-all
 * @access  Private
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0",
      [userId]
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
      data: {
        updated_count: result.affectedRows || 0,
      },
    });
  } catch (error) {
    logger.error("Mark all as read error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notifications as read",
    });
  }
};

/**
 * @desc    Delete a notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check ownership
    const notifications = await db.query(
      "SELECT id FROM notifications WHERE id = ? AND user_id = ?",
      [id, userId]
    );

    if (notifications.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    await db.query("DELETE FROM notifications WHERE id = ?", [id]);

    res.json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    logger.error("Delete notification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
    });
  }
};

/**
 * @desc    Delete all read notifications
 * @route   DELETE /api/notifications/clear-read
 * @access  Private
 */
exports.clearReadNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      "DELETE FROM notifications WHERE user_id = ? AND is_read = 1",
      [userId]
    );

    res.json({
      success: true,
      message: "Read notifications cleared",
      data: {
        deleted_count: result.affectedRows || 0,
      },
    });
  } catch (error) {
    logger.error("Clear read notifications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear notifications",
    });
  }
};

/**
 * @desc    Get email notification preferences
 * @route   GET /api/notifications/preferences
 * @access  Private
 */
exports.getPreferences = async (req, res) => {
  try {
    const userId = req.user.id;

    const users = await db.query(
      "SELECT email_notifications FROM users WHERE id = ?",
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: {
        email_notifications: users[0].email_notifications === 1,
      },
    });
  } catch (error) {
    logger.error("Get preferences error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get preferences",
    });
  }
};

/**
 * @desc    Update email notification preferences
 * @route   PATCH /api/notifications/preferences
 * @access  Private
 *
 * @body    { email_notifications: boolean }
 */
exports.updatePreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email_notifications } = req.body;

    if (typeof email_notifications !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "email_notifications must be a boolean",
      });
    }

    await db.query("UPDATE users SET email_notifications = ? WHERE id = ?", [
      email_notifications ? 1 : 0,
      userId,
    ]);

    // Log activity
    await db.query(
      `INSERT INTO activity_logs 
       (user_id, action, resource_type, resource_id, description, ip_address, user_agent, status)
       VALUES (?, 'update', 'preferences', ?, ?, ?, ?, 'success')`,
      [
        userId,
        userId,
        `${
          email_notifications ? "Subscribed to" : "Unsubscribed from"
        } email notifications`,
        req.ip || "0.0.0.0",
        req.headers["user-agent"] || "unknown",
      ]
    );

    logger.info(
      `User ${userId} ${
        email_notifications ? "subscribed to" : "unsubscribed from"
      } email notifications`
    );

    res.json({
      success: true,
      message: email_notifications
        ? "You are now subscribed to email notifications"
        : "You have unsubscribed from email notifications",
      data: {
        email_notifications,
      },
    });
  } catch (error) {
    logger.error("Update preferences error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update preferences",
    });
  }
};

/**
 * @desc    Unsubscribe from emails via token (for email link)
 * @route   GET /api/notifications/unsubscribe/:token
 * @access  Public
 */
exports.unsubscribeByToken = async (req, res) => {
  try {
    const { token } = req.params;

    // Token is base64 encoded user email
    let email;
    try {
      email = Buffer.from(token, "base64").toString("utf8");
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid unsubscribe token",
      });
    }

    // Find user by email
    const users = await db.query(
      "SELECT id, first_name FROM users WHERE email = ? AND deleted_at IS NULL",
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    // Update preference
    await db.query("UPDATE users SET email_notifications = 0 WHERE id = ?", [
      user.id,
    ]);

    logger.info(`User ${user.id} unsubscribed from emails via token`);

    // Return HTML page for email links
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .container { max-width: 500px; margin: 0 auto; }
          h1 { color: #4CAF50; }
          p { color: #666; }
          a { color: #2196F3; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✓ Unsubscribed</h1>
          <p>Hi ${user.first_name},</p>
          <p>You have been unsubscribed from email notifications.</p>
          <p>You can re-enable notifications anytime in your account settings.</p>
          <p><a href="${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/settings">Go to Settings</a></p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error("Unsubscribe by token error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unsubscribe",
    });
  }
};

/**
 * Helper: Create a notification
 * @param {Object} params - { user_id, type, title, message, related_item_type, related_item_id, action_url, expires_at }
 */
exports.createNotification = async ({
  user_id,
  type,
  title,
  message,
  related_item_type = null,
  related_item_id = null,
  action_url = null,
  expires_at = null,
}) => {
  try {
    const result = await db.query(
      `INSERT INTO notifications 
       (user_id, type, title, message, related_item_type, related_item_id, action_url, expires_at, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        user_id,
        type,
        title,
        message,
        related_item_type,
        related_item_id,
        action_url,
        expires_at,
      ]
    );

    return { success: true, id: result.insertId };
  } catch (error) {
    logger.error("Create notification error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Helper: Check if user has email notifications enabled
 * @param {number} userId
 */
exports.shouldSendEmail = async (userId) => {
  try {
    const users = await db.query(
      "SELECT email_notifications FROM users WHERE id = ? AND deleted_at IS NULL",
      [userId]
    );

    if (users.length === 0) return false;
    return users[0].email_notifications === 1;
  } catch (error) {
    logger.error("Check email preference error:", error);
    return false; // Default to not sending if error
  }
};
