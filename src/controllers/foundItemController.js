/**
 * Found Items Controller
 * Handles found item reports with admin approval workflow
 *
 * Key Security Features:
 * - All new items start with 'pending' status
 * - Updates reset status to 'pending' (requires re-approval)
 * - Only approved items visible to public
 * - Owner/admin access control
 * - Activity logging for all actions
 */

const { validationResult } = require("express-validator");
const db = require("../config/database");
const { processImage, deleteFile } = require("../utils/fileUpload");

/**
 * @desc    Create new found item report
 * @route   POST /api/found-items
 * @access  Private (authenticated users)
 */
exports.createFoundItem = async (req, res) => {
  let connection;
  const uploadedFiles = [];

  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Delete uploaded files if validation fails
      if (req.files) {
        req.files.forEach((file) => deleteFile(file.path));
      }
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const {
      title,
      description,
      category_id,
      found_location_id,
      found_date,
      found_time,
      storage_location_id,
      storage_notes,
      turned_in_to_security,
      unique_identifiers,
      condition_notes,
    } = req.body;

    const user_id = req.user.id;

    // Start transaction and capture the connection
    connection = await db.beginTransaction();

    try {
      // Insert found item (status defaults to 'pending') using transactional connection
      const result = await connection.execute(
        `INSERT INTO found_items 
        (user_id, title, description, category_id, found_location_id, 
         found_date, found_time, storage_location_id, storage_notes, 
         turned_in_to_security, unique_identifiers, condition_notes, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          user_id,
          title,
          description,
          category_id,
          found_location_id || null,
          found_date,
          found_time || null,
          storage_location_id || null,
          storage_notes || null,
          turned_in_to_security || false,
          unique_identifiers || null,
          condition_notes || null,
        ]
      );

      const foundItemId = result[0].insertId;

      // Process and save images if uploaded
      if (req.files && req.files.length > 0) {
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          // Track uploaded files to cleanup on error
          uploadedFiles.push(file.path);

          // Process image (resize, optimize)
          const imageData = await processImage(file.path);

          // Save to database using transactional connection
          await connection.execute(
            `INSERT INTO item_images (
              item_type, item_id, file_name, file_path, file_size,
              mime_type, width, height, is_primary, uploaded_by, upload_ip
            ) VALUES ('found', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              foundItemId,
              file.filename,
              file.path,
              imageData.size,
              file.mimetype,
              imageData.width,
              imageData.height,
              i === 0,
              req.user.id,
              req.ip || req.connection?.remoteAddress || "0.0.0.0",
            ]
          );

          // Delete original unprocessed file if processImage wrote a new file
          if (
            imageData &&
            imageData.processedPath &&
            imageData.processedPath !== file.path
          ) {
            // If processImage returns different path (not in current impl), remove original
            deleteFile(file.path);
          }
        }
      }

      await db.commit(connection);

      // Fetch complete item data
      const foundItem = await db.query(
        `SELECT fi.*, 
                c.name as category_name,
                l.name as location_name,
                u.school_id,
                u.first_name,
                u.last_name,
                GROUP_CONCAT(img.file_path) as images
         FROM found_items fi
         LEFT JOIN categories c ON fi.category_id = c.id
         LEFT JOIN locations l ON fi.found_location_id = l.id
         LEFT JOIN users u ON fi.user_id = u.id
         LEFT JOIN item_images img ON fi.id = img.item_id AND img.item_type = 'found'
         WHERE fi.id = ?
         GROUP BY fi.id`,
        [foundItemId]
      );

      // Log activity
      await db.query(
        `INSERT INTO activity_logs (user_id, action, description, ip_address, resource_type, resource_id, status) 
         VALUES (?, 'create_found_item', ?, ?, 'found_item', ?, 'success')`,
        [
          user_id,
          `Created found item: ${title}`,
          req.ip || req.connection?.remoteAddress || "0.0.0.0",
          foundItemId,
        ]
      );

      res.status(201).json({
        success: true,
        message: "Found item reported successfully. Pending admin approval.",
        data: {
          ...foundItem[0],
          images: foundItem[0].images ? foundItem[0].images.split(",") : [],
        },
      });
    } catch (error) {
      if (connection) await db.rollback(connection);
      // Clean up uploaded files on error
      uploadedFiles.forEach((filePath) => deleteFile(filePath));
      throw error;
    }
  } catch (error) {
    console.error("Create found item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create found item report",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @desc    Get all found items (with filtering, search, pagination)
 * @route   GET /api/found-items
 * @access  Public (approved only) / Admin (all items)
 */
exports.getFoundItems = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
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
      turned_in_to_security,
      page = 1,
      limit = 10,
    } = req.query;

    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereConditions = [];
    let params = [];

    // Public users only see approved items
    // Admin/Security see all items
    if (
      !req.user ||
      (req.user.role !== "admin" && req.user.role !== "security")
    ) {
      whereConditions.push("fi.status = 'approved'");
    } else if (status) {
      whereConditions.push("fi.status = ?");
      params.push(status);
    }

    // Search in title, description, unique identifiers
    if (search) {
      whereConditions.push(
        "(fi.title LIKE ? OR fi.description LIKE ? OR fi.unique_identifiers LIKE ?)"
      );
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Filter by category
    if (category_id) {
      whereConditions.push("fi.category_id = ?");
      params.push(category_id);
    }

    // Filter by location
    if (location_id) {
      whereConditions.push("fi.found_location_id = ?");
      params.push(location_id);
    }

    // Filter by date range
    if (date_from) {
      whereConditions.push("fi.found_date >= ?");
      params.push(date_from);
    }
    if (date_to) {
      whereConditions.push("fi.found_date <= ?");
      params.push(date_to);
    }

    // Filter by turned in to security
    if (turned_in_to_security !== undefined) {
      whereConditions.push("fi.turned_in_to_security = ?");
      params.push(turned_in_to_security === "true" ? 1 : 0);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total 
       FROM found_items fi 
       ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get items with pagination
    const items = await db.query(
      `SELECT fi.*, 
              c.name as category_name,
              l.name as location_name,
              u.school_id,
              u.first_name,
              u.last_name,
              GROUP_CONCAT(img.file_path) as images
       FROM found_items fi
       LEFT JOIN categories c ON fi.category_id = c.id
       LEFT JOIN locations l ON fi.found_location_id = l.id
       LEFT JOIN users u ON fi.user_id = u.id
       LEFT JOIN item_images img ON fi.id = img.item_id AND img.item_type = 'found'
       ${whereClause}
       GROUP BY fi.id
       ORDER BY fi.found_date DESC, fi.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Format images
    const formattedItems = items.map((item) => ({
      ...item,
      images: item.images ? item.images.split(",") : [],
    }));

    res.json({
      success: true,
      data: {
        items: formattedItems,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get found items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch found items",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @desc    Get single found item by ID
 * @route   GET /api/found-items/:id
 * @access  Public (if approved) / Owner / Admin
 */
exports.getFoundItemById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    const items = await db.query(
      `SELECT fi.*, 
              c.name as category_name,
              l.name as location_name,
              u.school_id,
              u.first_name,
              u.last_name,
              u.email,
              GROUP_CONCAT(img.file_path) as images
       FROM found_items fi
       LEFT JOIN categories c ON fi.category_id = c.id
       LEFT JOIN locations l ON fi.found_location_id = l.id
       LEFT JOIN users u ON fi.user_id = u.id
       LEFT JOIN item_images img ON fi.id = img.item_id AND img.item_type = 'found'
       WHERE fi.id = ?
       GROUP BY fi.id`,
      [id]
    );

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Found item not found",
      });
    }

    const item = items[0];

    // Access control
    const isOwner = req.user && req.user.id === item.user_id;
    const isAdmin =
      req.user && (req.user.role === "admin" || req.user.role === "security");
    const isApproved = item.status === "approved";

    if (!isApproved && !isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Item is pending approval.",
      });
    }

    // Hide sensitive info for non-owners/non-admins
    if (!isOwner && !isAdmin) {
      delete item.email;
      delete item.storage_location;
    }

    res.json({
      success: true,
      data: {
        ...item,
        images: item.images ? item.images.split(",") : [],
      },
    });
  } catch (error) {
    console.error("Get found item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch found item",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @desc    Update found item (owner only, resets to pending)
 * @route   PUT /api/found-items/:id
 * @access  Private (item owner only)
 */
exports.updateFoundItem = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const {
      title,
      description,
      category_id,
      found_location_id,
      found_date,
      found_time,
      storage_location_id,
      storage_notes,
      turned_in_to_security,
      unique_identifiers,
      condition_notes,
    } = req.body;

    // Check ownership
    const items = await db.query(
      "SELECT user_id, status FROM found_items WHERE id = ?",
      [id]
    );

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Found item not found",
      });
    }

    if (items[0].user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update your own items.",
      });
    }

    // Update item and reset to pending status
    await db.query(
      `UPDATE found_items 
       SET title = ?, description = ?, category_id = ?, found_location_id = ?,
           found_date = ?, found_time = ?, storage_location_id = ?, storage_notes = ?,
           turned_in_to_security = ?, unique_identifiers = ?, condition_notes = ?,
           status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title,
        description,
        category_id,
        found_location_id,
        found_date,
        found_time || null,
        storage_location_id || null,
        storage_notes || null,
        turned_in_to_security || false,
        unique_identifiers || null,
        condition_notes || null,
        id,
      ]
    );

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (user_id, action, description, ip_address, resource_type, resource_id, status) 
       VALUES (?, 'update_found_item', ?, ?, 'found_item', ?, 'success')`,
      [
        req.user.id,
        `Updated found item: ${title}`,
        req.ip || req.connection?.remoteAddress || "0.0.0.0",
        id,
      ]
    );

    // Fetch updated item
    const updatedItems = await db.query(
      `SELECT fi.*, 
              c.name as category_name,
              l.name as location_name,
              GROUP_CONCAT(img.file_path) as images
       FROM found_items fi
       LEFT JOIN categories c ON fi.category_id = c.id
       LEFT JOIN locations l ON fi.found_location_id = l.id
       LEFT JOIN item_images img ON fi.id = img.item_id AND img.item_type = 'found'
       WHERE fi.id = ?
       GROUP BY fi.id`,
      [id]
    );

    res.json({
      success: true,
      message: "Found item updated successfully. Pending admin re-approval.",
      data: {
        ...updatedItems[0],
        images: updatedItems[0].images ? updatedItems[0].images.split(",") : [],
      },
    });
  } catch (error) {
    console.error("Update found item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update found item",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @desc    Delete found item (soft delete)
 * @route   DELETE /api/found-items/:id
 * @access  Private (owner or admin)
 */
exports.deleteFoundItem = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    // Check ownership or admin
    const items = await db.query(
      "SELECT user_id FROM found_items WHERE id = ?",
      [id]
    );

    const isdeleted = await db.query(
      "SELECT deleted_at FROM found_items WHERE id = ?",
      [id]
    );

    if (isdeleted[0].deleted_at !== null) {
      return res.status(404).json({
        success: false,
        message: "item not found",
      });
    }

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "item not found",
      });
    }

    const isOwner = items[0].user_id === req.user.id;
    const isAdmin = req.user.role === "admin" || req.user.role === "security";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Soft delete - set deleted_at timestamp
    await db.query(
      "UPDATE found_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id]
    );

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (user_id, action, description, ip_address, resource_type, resource_id, status) 
       VALUES (?, 'delete_found_item', ?, ?, 'found_item', ?, 'success')`,
      [
        req.user.id,
        `Deleted found item ID: ${id}`,
        req.ip || req.connection?.remoteAddress || "0.0.0.0",
        id,
      ]
    );

    res.json({
      success: true,
      message: "Found item deleted successfully",
    });
  } catch (error) {
    console.error("Delete found item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete found item",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @desc    Approve or reject found item
 * @route   PATCH /api/found-items/:id/review
 * @access  Private (admin/security only)
 */
exports.reviewFoundItem = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const { id } = req.params;
  const { status, rejection_reason } = req.body;

  // Validate status
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be 'approved' or 'rejected'",
    });
  }

  let connection;
  
  try {
    // Check if item exists
    const items = await db.query(
      "SELECT user_id FROM found_items WHERE id = ?",
      [id]
    );

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Found item not found",
      });
    }

    const reporterId = items[0].user_id;

    // Start transaction
    connection = await db.beginTransaction();

    // Update item status
    await connection.query(
      `UPDATE found_items 
       SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, 
           rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, req.user.id, rejection_reason || null, id]
    );

    // Create notification for reporter
    const notificationType = status === "approved" ? "post_approved" : "post_rejected";
    const notificationTitle = status === "approved" 
      ? "Found Item Approved" 
      : "Found Item Rejected";
    
    const notificationMessage =
      status === "approved"
        ? "Your found item report has been approved"
        : `Your found item report was rejected. Reason: ${
            rejection_reason || "Not specified"
          }`;

    await connection.query(
      `INSERT INTO notifications (user_id, type, title, message, related_item_id, related_item_type) 
       VALUES (?, ?, ?, ?, ?, 'found')`,
      [reporterId, notificationType, notificationTitle, notificationMessage, id]
    );

    await db.commit(connection);

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (user_id, action, description, ip_address, resource_type, resource_id, status) 
       VALUES (?, 'review_found_item', ?, ?, 'found_item', ?, 'success')`,
      [
        req.user.id,
        `Reviewed found item ID ${id}: ${status}${
          rejection_reason ? ` - ${rejection_reason}` : ""
        }`,
        req.ip || req.connection?.remoteAddress || "0.0.0.0",
        id,
      ]
    );

    res.json({
      success: true,
      message: `Found item ${status} successfully`,
    });
  } catch (error) {
    if (connection) {
      await db.rollback(connection);
    }
    console.error("Review found item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to review found item",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
