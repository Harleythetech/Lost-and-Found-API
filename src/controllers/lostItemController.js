/**
 * Lost Items Controller
 * Handles lost item reports with admin approval workflow
 *
 * SECURITY & FEATURES:
 * 1. Users can only edit their own items
 * 2. Edits reset status to 'pending' (requires re-approval)
 * 3. Admin/Security can approve/reject
 * 4. Image upload support
 * 5. Activity logging
 * 6. Soft delete
 */

const { validationResult } = require("express-validator");
const db = require("../config/database");
const logger = require("../utils/logger");
const {
  processImage,
  deleteFile,
  deleteItemDirectory,
  getFileUrl,
  moveToItemDirectory,
} = require("../utils/fileUpload");

/**
 * Sanitize string for SQL LIKE queries
 * Escapes special characters: %, _, and \
 */
const sanitizeForLike = (str) => {
  if (!str) return str;
  return str
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/%/g, "\\%") // Escape percent
    .replace(/_/g, "\\_"); // Escape underscore
};

/**
 * Create Lost Item Report
 * POST /api/lost-items
 * Access: Authenticated users
 */
const createLostItem = async (req, res) => {
  let connection;
  let itemId = null;
  const uploadedFiles = [];

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      title,
      description,
      category_id,
      last_seen_location_id,
      last_seen_date,
      last_seen_time,
      unique_identifiers,
      reward_offered,
      contact_via_email,
      contact_via_phone,
      email,
      phone_number,
    } = req.body;

    connection = await db.beginTransaction();

    const result = await connection.execute(
      `INSERT INTO lost_items (
        user_id, title, description, category_id, last_seen_location_id,
        last_seen_date, last_seen_time, unique_identifiers, reward_offered,
        contact_via_email, contact_via_phone, email, phone_number, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.user.id,
        title,
        description,
        category_id,
        last_seen_location_id || null,
        last_seen_date,
        last_seen_time || null,
        unique_identifiers || null,
        reward_offered || 0,
        contact_via_email !== false,
        contact_via_phone || false,
        email || null,
        phone_number || null,
      ]
    );

    itemId = result[0].insertId;

    // Process uploaded images - move to item-specific folder
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        uploadedFiles.push(file.path);

        // Process image (resize if needed) while still in temp
        const imageData = await processImage(file.path);

        // Move file to item-specific directory: uploads/lost-items/{itemId}/
        const newPath = moveToItemDirectory(file.path, "lost", itemId);

        // Save to database with new path
        await connection.execute(
          `INSERT INTO item_images (
            item_type, item_id, file_name, file_path, file_size,
            mime_type, width, height, is_primary, uploaded_by, upload_ip
          ) VALUES ('lost', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            file.filename,
            newPath,
            imageData.size,
            file.mimetype,
            imageData.width,
            imageData.height,
            i === 0, // First image is primary
            req.user.id,
            req.ip || req.connection?.remoteAddress || "0.0.0.0",
          ]
        );

        // Update uploadedFiles with new path for cleanup on error
        uploadedFiles[i] = newPath;
      }
    }

    // Log activity
    await connection.execute(
      `INSERT INTO activity_logs (
        user_id, ip_address, user_agent, action, resource_type,
        resource_id, description, status
      ) VALUES (?, ?, ?, 'create_lost_item', 'lost_item', ?, ?, 'success')`,
      [
        req.user.id,
        req.ip || req.connection?.remoteAddress || "0.0.0.0",
        req.headers["user-agent"] || "unknown",
        itemId,
        `Created lost item: ${title}`,
      ]
    );

    await db.commit(connection);

    logger.info(`Lost item created by user ${req.user.school_id}: ${title}`);

    res.status(201).json({
      success: true,
      message:
        "Lost item report submitted successfully. Pending admin approval.",
      data: {
        id: itemId,
        title,
        description,
        category_id,
        status: "pending",
      },
    });
  } catch (error) {
    if (connection) await db.rollback(connection);

    // Delete uploaded files on error
    uploadedFiles.forEach((filePath) => deleteFile(filePath));

    // Also try to delete the item directory if it was created
    if (itemId) {
      deleteItemDirectory("lost", itemId);
    }

    logger.error("Create lost item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create lost item report",
    });
  }
};

/**
 * Get All Lost Items (with filters)
 * GET /api/lost-items
 * Access: Public (only approved items) / Admin (all items)
 */
const getLostItems = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      search,
      category_id,
      location_id,
      status,
      date_from,
      date_to,
      page = 1,
      limit = 20,
    } = req.query;

    let whereConditions = ["li.deleted_at IS NULL"];
    let params = [];

    // Non-admin users can only see approved items
    if (!req.user || !["admin", "security"].includes(req.user.role)) {
      whereConditions.push("li.status = 'approved'");
    } else if (status) {
      whereConditions.push("li.status = ?");
      params.push(status);
    }

    // Search by keyword
    if (search) {
      whereConditions.push(
        "(li.title LIKE ? OR li.description LIKE ? OR li.unique_identifiers LIKE ?)"
      );
      const sanitizedSearch = sanitizeForLike(search);
      const searchTerm = `%${sanitizedSearch}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Filter by category
    if (category_id) {
      whereConditions.push("li.category_id = ?");
      params.push(category_id);
    }

    // Filter by location
    if (location_id) {
      whereConditions.push("li.last_seen_location_id = ?");
      params.push(location_id);
    }

    // Filter by date range
    if (date_from) {
      whereConditions.push("li.last_seen_date >= ?");
      params.push(date_from);
    }
    if (date_to) {
      whereConditions.push("li.last_seen_date <= ?");
      params.push(date_to);
    }

    const whereClause = whereConditions.join(" AND ");
    const offset = (page - 1) * limit;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM lost_items li
      WHERE ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = countResult[0].total;

    // Get items
    const itemsQuery = `
      SELECT 
        li.id, li.title, li.description, li.status, li.category_id,
        li.last_seen_date, li.last_seen_time, li.reward_offered,
        li.created_at, li.updated_at,
        c.name as category,
        l.name as last_seen_location,
        CONCAT(u.first_name, ' ', u.last_name) as reporter_name,
        u.school_id as reporter_school_id,
        (SELECT file_path FROM item_images 
         WHERE item_type = 'lost' AND item_id = li.id AND is_primary = TRUE 
         LIMIT 1) as primary_image
      FROM lost_items li
      JOIN users u ON li.user_id = u.id
      JOIN categories c ON li.category_id = c.id
      LEFT JOIN locations l ON li.last_seen_location_id = l.id
      WHERE ${whereClause}
      ORDER BY li.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const items = await db.query(itemsQuery, [...params, limit, offset]);

    // Add image URLs
    items.forEach((item) => {
      if (item.primary_image) {
        item.primary_image = getFileUrl(item.primary_image);
      }
    });

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error("Get lost items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve lost items",
    });
  }
};

/**
 * Get Single Lost Item
 * GET /api/lost-items/:id
 * Access: Public (if approved) / Owner / Admin
 */
const getLostItemById = async (req, res) => {
  try {
    const { id } = req.params;

    const items = await db.query(
      `SELECT 
        li.*,
        c.name as category,
        l.name as last_seen_location,
        CONCAT(u.first_name, ' ', u.last_name) as reporter_name,
        u.school_id as reporter_school_id,
        u.contact_number as reporter_contact,
        u.email as reporter_email
      FROM lost_items li
      JOIN users u ON li.user_id = u.id
      JOIN categories c ON li.category_id = c.id
      LEFT JOIN locations l ON li.last_seen_location_id = l.id
      WHERE li.id = ? AND li.deleted_at IS NULL`,
      [id]
    );

    if (!items || items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Lost item not found",
      });
    }

    const item = items[0];

    // Check access permission
    const isOwner = req.user && req.user.id === item.user_id;
    const isAdmin = req.user && ["admin", "security"].includes(req.user.role);
    const isApproved = item.status === "approved";

    if (!isApproved && !isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get images
    const images = await db.query(
      `SELECT id, file_path, is_primary FROM item_images
       WHERE item_type = 'lost' AND item_id = ?
       ORDER BY is_primary DESC, created_at ASC`,
      [id]
    );

    item.images = images.map((img) => ({
      id: img.id,
      url: getFileUrl(img.file_path),
      is_primary: img.is_primary,
    }));

    // Hide contact info for non-owners/admins
    if (!isOwner && !isAdmin) {
      delete item.reporter_contact;
      delete item.reporter_email;
    }

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    logger.error("Get lost item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve lost item",
    });
  }
};

/**
 * Update Lost Item
 * PUT /api/lost-items/:id
 * Access: Item owner only
 * Note: Resets status to 'pending' (requires re-approval)
 */
const updateLostItem = async (req, res) => {
  let connection;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    // Check ownership
    const items = await db.query(
      "SELECT user_id, title, status FROM lost_items WHERE id = ? AND deleted_at IS NULL",
      [id]
    );

    if (!items || items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Lost item not found",
      });
    }

    if (items[0].user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own items",
      });
    }

    const {
      title,
      description,
      category_id,
      last_seen_location_id,
      last_seen_date,
      last_seen_time,
      unique_identifiers,
      reward_offered,
      contact_via_email,
      contact_via_phone,
      email,
      phone_number,
    } = req.body;

    connection = await db.beginTransaction();

    // Update item - RESET STATUS TO PENDING
    await connection.execute(
      `UPDATE lost_items SET
        title = ?, description = ?, category_id = ?,
        last_seen_location_id = ?, last_seen_date = ?, last_seen_time = ?,
        unique_identifiers = ?, reward_offered = ?,
        contact_via_email = ?, contact_via_phone = ?,
        email = ?, \`phone_number\` = ?,
        status = 'pending', reviewed_by = NULL, reviewed_at = NULL
      WHERE id = ?`,
      [
        title,
        description,
        category_id,
        last_seen_location_id || null,
        last_seen_date,
        last_seen_time || null,
        unique_identifiers || null,
        reward_offered || 0,
        contact_via_email !== false,
        contact_via_phone || false,
        email || null,
        phone_number || null,
        id,
      ]
    );

    // Log activity
    await connection.execute(
      `INSERT INTO activity_logs (
        user_id, ip_address, user_agent, action, resource_type,
        resource_id, description, status
      ) VALUES (?, ?, ?, 'update_lost_item', 'lost_item', ?, ?, 'success')`,
      [
        req.user.id,
        req.ip || req.connection?.remoteAddress || "0.0.0.0",
        req.headers["user-agent"] || "unknown",
        id,
        `Updated lost item: ${title} (reset to pending)`,
      ]
    );

    await db.commit(connection);

    logger.info(`Lost item ${id} updated by user ${req.user.school_id}`);

    // Get updated item
    const updated = await db.query(
      "SELECT id, title, description, category_id, status FROM lost_items WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: "Lost item updated successfully. Pending admin re-approval.",
      data: updated[0],
    });
  } catch (error) {
    if (connection) await db.rollback(connection);

    logger.error("Update lost item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update lost item",
    });
  }
};

/**
 * Delete Lost Item (Soft Delete)
 * DELETE /api/lost-items/:id
 * Access: Item owner or Admin
 */
const deleteLostItem = async (req, res) => {
  try {
    const { id } = req.params;

    const items = await db.query(
      "SELECT user_id FROM lost_items WHERE id = ? AND deleted_at IS NULL",
      [id]
    );

    if (!items || items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "item not found",
      });
    }

    const isdeleted = await db.query(
      "SELECT deleted_at FROM lost_items WHERE id = ?",
      [id]
    );

    if (isdeleted[0].deleted_at !== null) {
      return res.status(404).json({
        success: false,
        message: "item not found",
      });
    }

    const isOwner = items[0].user_id === req.user.id;
    const isAdmin = ["admin", "security"].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied, you do not have permission to perform this action",
      });
    }

    // Soft delete
    await db.query("UPDATE lost_items SET deleted_at = NOW() WHERE id = ?", [
      id,
    ]);

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (
        user_id, ip_address, user_agent, action, resource_type,
        resource_id, description, status
      ) VALUES (?, ?, ?, 'delete_lost_item', 'lost_item', ?, ?, 'success')`,
      [
        req.user.id,
        req.ip || req.connection?.remoteAddress || "0.0.0.0",
        req.headers["user-agent"] || "unknown",
        id,
        `Deleted lost item ID: ${id}`,
      ]
    );

    logger.info(`Lost item ${id} deleted by user ${req.user.school_id}`);

    res.json({
      success: true,
      message: "Lost item deleted successfully",
    });
  } catch (error) {
    logger.error("Delete lost item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete lost item",
    });
  }
};

/**
 * Approve/Reject Lost Item
 * PATCH /api/lost-items/:id/review
 * Access: Admin/Security only
 */
const reviewLostItem = async (req, res) => {
  let connection;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const { status, rejection_reason } = req.body;

    const items = await db.query(
      "SELECT id, user_id, title FROM lost_items WHERE id = ? AND deleted_at IS NULL",
      [id]
    );

    if (!items || items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Lost item not found",
      });
    }

    connection = await db.beginTransaction();

    // Update status
    await connection.execute(
      `UPDATE lost_items SET
        status = ?, reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ?
      WHERE id = ?`,
      [status, req.user.id, rejection_reason || null, id]
    );

    // Create notification for user
    const message =
      status === "approved"
        ? `Your lost item report "${items[0].title}" has been approved and is now public.`
        : `Your lost item report "${items[0].title}" was rejected. Reason: ${rejection_reason}`;

    await connection.execute(
      `INSERT INTO notifications (
        user_id, type, title, message, related_item_type, related_item_id
      ) VALUES (?, 'post_${status}', ?, ?, 'lost', ?)`,
      [
        items[0].user_id,
        status === "approved" ? "Post Approved" : "Post Rejected",
        message,
        id,
      ]
    );

    // Log activity
    await connection.execute(
      `INSERT INTO activity_logs (
        user_id, ip_address, user_agent, action, resource_type,
        resource_id, description, status
      ) VALUES (?, ?, ?, 'review_lost_item', 'lost_item', ?, ?, 'success')`,
      [
        req.user.id,
        req.ip || req.connection?.remoteAddress || "0.0.0.0",
        req.headers["user-agent"] || "unknown",
        id,
        `${status} lost item: ${items[0].title}`,
      ]
    );

    await db.commit(connection);

    logger.info(`Lost item ${id} ${status} by ${req.user.school_id}`);

    res.json({
      success: true,
      message: `Lost item ${status} successfully`,
      data: { id, status },
    });
  } catch (error) {
    if (connection) await db.rollback(connection);

    logger.error("Review lost item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to review lost item",
    });
  }
};

module.exports = {
  createLostItem,
  getLostItems,
  getLostItemById,
  updateLostItem,
  deleteLostItem,
  reviewLostItem,
};
