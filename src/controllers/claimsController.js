/**
 * Claims Controller
 * Handles claim submissions for found items
 *
 * WORKFLOW:
 * 1. User finds an item they believe is theirs
 * 2. User submits a claim with proof of ownership
 * 3. Admin reviews the claim and verifies ownership
 * 4. If approved, pickup is scheduled
 * 5. Item is marked as claimed when picked up
 *
 * SECURITY FEATURES:
 * - Only authenticated users can submit claims
 * - Only admins can verify/approve claims
 * - Activity logging for all actions
 * - Image upload for proof of ownership
 */

const { validationResult } = require("express-validator");
const db = require("../config/database");
const logger = require("../utils/logger");
const {
  processImage,
  deleteFile,
  moveToItemDirectory,
  deleteItemDirectory,
  getFileUrl,
} = require("../utils/fileUpload");
const emailService = require("../services/emailService");

/**
 * @desc    Submit a claim for a found item
 * @route   POST /api/claims
 * @access  Private (authenticated users)
 *
 * @body    {
 *            found_item_id: number (required),
 *            description: string (required) - describe why this is yours,
 *            proof_details: string (required) - detailed proof of ownership
 *          }
 * @files   images[] - proof images (optional, max 5)
 */
exports.submitClaim = async (req, res) => {
  let connection;
  const uploadedFiles = [];
  let claimId = null;

  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.files) {
        req.files.forEach((file) => deleteFile(file.path));
      }
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { found_item_id, description, proof_details } = req.body;
    const claimant_user_id = req.user.id;

    // Check if found item exists and is claimable
    const foundItems = await db.query(
      `SELECT fi.*, u.email as finder_email, u.first_name as finder_name
       FROM found_items fi
       JOIN users u ON fi.user_id = u.id
       WHERE fi.id = ? AND fi.deleted_at IS NULL`,
      [found_item_id]
    );

    if (foundItems.length === 0) {
      if (req.files) req.files.forEach((file) => deleteFile(file.path));
      return res.status(404).json({
        success: false,
        message: "Found item not found",
      });
    }

    const foundItem = foundItems[0];

    // Check if item is approved (can be claimed)
    if (foundItem.status !== "approved") {
      if (req.files) req.files.forEach((file) => deleteFile(file.path));
      return res.status(400).json({
        success: false,
        message: `Cannot claim this item. Current status: ${foundItem.status}`,
      });
    }

    // Check if user already has a pending claim for this item
    const existingClaims = await db.query(
      `SELECT id, status FROM claims 
       WHERE found_item_id = ? AND claimant_user_id = ? AND status = 'pending'`,
      [found_item_id, claimant_user_id]
    );

    if (existingClaims.length > 0) {
      if (req.files) req.files.forEach((file) => deleteFile(file.path));
      return res.status(400).json({
        success: false,
        message: "You already have a pending claim for this item",
        data: { existing_claim_id: existingClaims[0].id },
      });
    }

    // Prevent claiming your own found item
    if (foundItem.user_id === claimant_user_id) {
      if (req.files) req.files.forEach((file) => deleteFile(file.path));
      return res.status(400).json({
        success: false,
        message: "You cannot claim an item you reported as found",
      });
    }

    // Start transaction
    connection = await db.beginTransaction();

    try {
      // Insert claim
      const result = await connection.execute(
        `INSERT INTO claims 
         (found_item_id, claimant_user_id, description, proof_details, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [found_item_id, claimant_user_id, description, proof_details]
      );

      claimId = result[0].insertId;

      // Process and save proof images if uploaded
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          uploadedFiles.push(file.path);

          // Process image (resize, optimize)
          await processImage(file.path);

          // Move file to claim-specific directory
          const newPath = await moveToItemDirectory(
            file.path,
            "claim",
            claimId
          );

          await connection.execute(
            `INSERT INTO claim_images 
             (claim_id, file_name, file_path, file_size, mime_type, image_type, description)
             VALUES (?, ?, ?, ?, ?, 'proof', 'Proof of ownership')`,
            [claimId, file.filename, newPath, file.size, file.mimetype]
          );
        }
      }

      // Log activity
      await connection.execute(
        `INSERT INTO activity_logs 
         (user_id, action, resource_type, resource_id, description, ip_address, user_agent, status)
         VALUES (?, 'create', 'claim', ?, ?, ?, ?, 'success')`,
        [
          claimant_user_id,
          claimId,
          `Submitted claim for found item #${found_item_id}`,
          req.ip || "0.0.0.0",
          req.headers["user-agent"] || "unknown",
        ]
      );

      // Create notification for admins
      await connection.execute(
        `INSERT INTO notifications (user_id, type, title, message, related_item_type, related_item_id)
         SELECT id, 'claim_request', 'New Claim Submitted', 
                ?, 'claim', ?
         FROM users WHERE role = 'admin' AND deleted_at IS NULL`,
        [`A new claim has been submitted for "${foundItem.title}"`, claimId]
      );

      await db.commit(connection);

      logger.info(
        `Claim #${claimId} submitted by user ${claimant_user_id} for found item #${found_item_id}`
      );

      res.status(201).json({
        success: true,
        message:
          "Claim submitted successfully. An admin will review your claim.",
        data: {
          id: claimId,
          found_item_id,
          status: "pending",
          created_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      await db.rollback(connection);
      uploadedFiles.forEach((file) => deleteFile(file));
      // Also delete the claim directory if it was created
      if (claimId) {
        deleteItemDirectory("claim", claimId);
      }
      throw error;
    }
  } catch (error) {
    logger.error("Submit claim error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit claim",
    });
  }
};

/**
 * @desc    Get all claims (admin) or user's own claims
 * @route   GET /api/claims
 * @access  Private
 *
 * @query   status - filter by status (pending, approved, rejected, cancelled)
 * @query   page - page number (default: 1)
 * @query   limit - items per page (default: 10)
 */
exports.getClaims = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const isAdmin = req.user.role === "admin" || req.user.role === "security";

    let whereClause = "1=1";
    const params = [];

    // Non-admins can only see their own claims
    if (!isAdmin) {
      whereClause += " AND c.claimant_user_id = ?";
      params.push(req.user.id);
    }

    // Filter by status
    // "all" or no status = return everything
    if (status && status !== "all") {
      whereClause += " AND c.status = ?";
      params.push(status);
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM claims c WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get claims with related data
    const claims = await db.query(
      `SELECT 
        c.*,
        fi.id as item_id,
        fi.title as item_title,
        fi.description as item_description,
        fi.status as item_status,
        fi.found_date,
        fi.found_time,
        fi.unique_identifiers as item_unique_identifiers,
        fi.condition_notes as item_condition,
        fi.storage_notes,
        cat.name as category_name,
        loc.name as found_location,
        sloc.name as storage_location,
        u.first_name as claimant_first_name,
        u.last_name as claimant_last_name,
        u.email as claimant_email,
        u.school_id as claimant_school_id,
        u.contact_number as claimant_contact,
        finder.first_name as finder_first_name,
        finder.last_name as finder_last_name,
        finder.school_id as finder_school_id,
        v.first_name as verifier_first_name,
        v.last_name as verifier_last_name,
        (SELECT COUNT(*) FROM claim_images WHERE claim_id = c.id) as proof_image_count,
        (SELECT COUNT(*) FROM item_images WHERE item_type = 'found' AND item_id = fi.id) as item_image_count,
        (SELECT file_path FROM item_images WHERE item_type = 'found' AND item_id = fi.id AND is_primary = 1 LIMIT 1) as item_primary_image
       FROM claims c
       JOIN found_items fi ON c.found_item_id = fi.id
       JOIN users u ON c.claimant_user_id = u.id
       JOIN users finder ON fi.user_id = finder.id
       LEFT JOIN categories cat ON fi.category_id = cat.id
       LEFT JOIN locations loc ON fi.found_location_id = loc.id
       LEFT JOIN locations sloc ON fi.storage_location_id = sloc.id
       LEFT JOIN users v ON c.verified_by = v.id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get all claim IDs for fetching images
    const claimIds = claims.map((c) => c.id);

    // Fetch proof images for all claims in one query
    let proofImagesMap = {};
    let itemImagesMap = {};

    if (claimIds.length > 0) {
      const placeholders = claimIds.map(() => "?").join(",");
      const proofImages = await db.query(
        `SELECT claim_id, id, file_name, file_path, image_type, description
         FROM claim_images 
         WHERE claim_id IN (${placeholders})`,
        claimIds
      );

      // Group proof images by claim_id
      proofImages.forEach((img) => {
        if (!proofImagesMap[img.claim_id]) {
          proofImagesMap[img.claim_id] = [];
        }
        proofImagesMap[img.claim_id].push({
          id: img.id,
          file_name: img.file_name,
          image_type: img.image_type,
          description: img.description,
          url: getFileUrl(img.file_path),
        });
      });

      // Fetch item images for all found items
      const itemIds = [...new Set(claims.map((c) => c.item_id))];
      const itemPlaceholders = itemIds.map(() => "?").join(",");
      const itemImages = await db.query(
        `SELECT item_id, id, file_name, file_path, is_primary
         FROM item_images 
         WHERE item_type = 'found' AND item_id IN (${itemPlaceholders})`,
        itemIds
      );

      // Group item images by item_id
      itemImages.forEach((img) => {
        if (!itemImagesMap[img.item_id]) {
          itemImagesMap[img.item_id] = [];
        }
        itemImagesMap[img.item_id].push({
          id: img.id,
          file_name: img.file_name,
          is_primary: img.is_primary,
          url: getFileUrl(img.file_path),
        });
      });
    }

    // Format claims with images and computed fields
    const formattedClaims = claims.map((claim) => ({
      ...claim,
      item_primary_image: claim.item_primary_image
        ? getFileUrl(claim.item_primary_image)
        : null,
      claimant_name:
        `${claim.claimant_first_name} ${claim.claimant_last_name}`.trim(),
      finder_name:
        `${claim.finder_first_name} ${claim.finder_last_name}`.trim(),
      verifier_name: claim.verifier_first_name
        ? `${claim.verifier_first_name} ${claim.verifier_last_name}`.trim()
        : null,
      proof_images: proofImagesMap[claim.id] || [],
      item_images: itemImagesMap[claim.item_id] || [],
    }));

    res.json({
      success: true,
      data: formattedClaims,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Get claims error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch claims",
    });
  }
};

/**
 * @desc    Get single claim details
 * @route   GET /api/claims/:id
 * @access  Private (owner or admin)
 */
exports.getClaimById = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === "admin" || req.user.role === "security";

    // Get claim with full details
    const claims = await db.query(
      `SELECT 
        c.*,
        fi.id as item_id,
        fi.title as item_title,
        fi.description as item_description,
        fi.status as item_status,
        fi.found_date,
        fi.storage_notes,
        cat.name as category_name,
        loc.name as found_location,
        sloc.name as storage_location,
        finder.first_name as finder_first_name,
        finder.last_name as finder_last_name,
        claimant.first_name as claimant_first_name,
        claimant.last_name as claimant_last_name,
        claimant.email as claimant_email,
        claimant.school_id as claimant_school_id,
        claimant.contact_number as claimant_contact,
        verifier.first_name as verifier_first_name,
        verifier.last_name as verifier_last_name
       FROM claims c
       JOIN found_items fi ON c.found_item_id = fi.id
       JOIN users finder ON fi.user_id = finder.id
       JOIN users claimant ON c.claimant_user_id = claimant.id
       LEFT JOIN categories cat ON fi.category_id = cat.id
       LEFT JOIN locations loc ON fi.found_location_id = loc.id
       LEFT JOIN locations sloc ON fi.storage_location_id = sloc.id
       LEFT JOIN users verifier ON c.verified_by = verifier.id
       WHERE c.id = ?`,
      [id]
    );

    if (claims.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Claim not found",
      });
    }

    const claim = claims[0];

    // Check access (owner or admin)
    if (!isAdmin && claim.claimant_user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get claim images
    const images = await db.query(
      `SELECT id, file_name, file_path, image_type, description, created_at
       FROM claim_images WHERE claim_id = ?`,
      [id]
    );

    // Get item images
    const itemImages = await db.query(
      `SELECT id, file_name, file_path, is_primary
       FROM item_images WHERE item_type = 'found' AND item_id = ?`,
      [claim.item_id]
    );

    // Format image URLs
    const formattedProofImages = images.map((img) => ({
      ...img,
      url: getFileUrl(img.file_path),
    }));

    const formattedItemImages = itemImages.map((img) => ({
      ...img,
      url: getFileUrl(img.file_path),
    }));

    res.json({
      success: true,
      data: {
        ...claim,
        claimant_name:
          `${claim.claimant_first_name} ${claim.claimant_last_name}`.trim(),
        finder_name:
          `${claim.finder_first_name} ${claim.finder_last_name}`.trim(),
        verifier_name: claim.verifier_first_name
          ? `${claim.verifier_first_name} ${claim.verifier_last_name}`.trim()
          : null,
        proof_images: formattedProofImages,
        item_images: formattedItemImages,
      },
    });
  } catch (error) {
    logger.error("Get claim by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch claim",
    });
  }
};

/**
 * @desc    Verify/Review a claim (approve or reject)
 * @route   PATCH /api/claims/:id/verify
 * @access  Private (admin/security only)
 *
 * @body    {
 *            action: 'approve' | 'reject' (required),
 *            verification_notes: string (optional),
 *            rejection_reason: string (required if rejecting),
 *            pickup_scheduled: datetime (optional, for approved claims)
 *          }
 */
exports.verifyClaim = async (req, res) => {
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
    const { action, verification_notes, rejection_reason, pickup_scheduled } =
      req.body;
    const verified_by = req.user.id;

    // Get claim
    const claims = await db.query(
      `SELECT c.*, fi.title as item_title, fi.user_id as finder_id,
              u.email as claimant_email, u.first_name as claimant_name
       FROM claims c
       JOIN found_items fi ON c.found_item_id = fi.id
       JOIN users u ON c.claimant_user_id = u.id
       WHERE c.id = ?`,
      [id]
    );

    if (claims.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Claim not found",
      });
    }

    const claim = claims[0];

    if (claim.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot verify claim. Current status: ${claim.status}`,
      });
    }

    // Validate rejection reason
    if (action === "reject" && !rejection_reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    connection = await db.beginTransaction();

    try {
      const newStatus = action === "approve" ? "approved" : "rejected";

      // Convert ISO datetime to MySQL format if provided
      let mysqlPickupScheduled = null;
      if (action === "approve" && pickup_scheduled) {
        const date = new Date(pickup_scheduled);
        mysqlPickupScheduled = date
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
      }

      // Update claim
      await connection.execute(
        `UPDATE claims SET
          status = ?,
          verified_by = ?,
          verified_at = NOW(),
          verification_notes = ?,
          rejection_reason = ?,
          pickup_scheduled = ?,
          updated_at = NOW()
         WHERE id = ?`,
        [
          newStatus,
          verified_by,
          verification_notes || null,
          action === "reject" ? rejection_reason : null,
          mysqlPickupScheduled,
          id,
        ]
      );

      // If approved, update found item status
      if (action === "approve") {
        await connection.execute(
          `UPDATE found_items SET status = 'claimed', updated_at = NOW() WHERE id = ?`,
          [claim.found_item_id]
        );

        // Reject any other pending claims for this item
        await connection.execute(
          `UPDATE claims SET 
            status = 'rejected', 
            rejection_reason = 'Another claim was approved for this item',
            verified_by = ?,
            verified_at = NOW()
           WHERE found_item_id = ? AND id != ? AND status = 'pending'`,
          [verified_by, claim.found_item_id, id]
        );
      }

      // Create notification for claimant
      const notificationMessage =
        action === "approve"
          ? `Your claim for "${claim.item_title}" has been approved! ${
              pickup_scheduled
                ? "Pickup scheduled for " +
                  new Date(pickup_scheduled).toLocaleString()
                : "Please contact us to schedule pickup."
            }`
          : `Your claim for "${claim.item_title}" was rejected. Reason: ${rejection_reason}`;

      await connection.execute(
        `INSERT INTO notifications (user_id, type, title, message, related_item_type, related_item_id)
         VALUES (?, ?, ?, ?, 'claim', ?)`,
        [
          claim.claimant_user_id,
          "claim_response",
          action === "approve" ? "Claim Approved!" : "Claim Rejected",
          notificationMessage,
          id,
        ]
      );

      // Log activity
      await connection.execute(
        `INSERT INTO activity_logs 
         (user_id, action, resource_type, resource_id, description, ip_address, user_agent, status)
         VALUES (?, ?, 'claim', ?, ?, ?, ?, 'success')`,
        [
          verified_by,
          action === "approve" ? "approve" : "reject",
          id,
          `${
            action === "approve" ? "Approved" : "Rejected"
          } claim #${id} for "${claim.item_title}"`,
          req.ip || "0.0.0.0",
          req.headers["user-agent"] || "unknown",
        ]
      );

      await db.commit(connection);

      // Send email notification
      try {
        if (action === "approve") {
          await emailService.sendClaimApprovedEmail(
            {
              email: claim.claimant_email,
              first_name: claim.claimant_name,
            },
            claim.item_title,
            pickup_scheduled
          );
        } else {
          await emailService.sendClaimRejectedEmail(
            {
              email: claim.claimant_email,
              first_name: claim.claimant_name,
            },
            claim.item_title,
            rejection_reason
          );
        }
      } catch (emailError) {
        logger.error("Failed to send claim notification email:", emailError);
      }

      logger.info(`Claim #${id} ${action}d by admin ${verified_by}`);

      res.json({
        success: true,
        message: `Claim ${action}d successfully`,
        data: {
          id,
          status: newStatus,
          verified_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      await db.rollback(connection);
      throw error;
    }
  } catch (error) {
    logger.error("Verify claim error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify claim",
    });
  }
};

/**
 * @desc    Record item pickup
 * @route   PATCH /api/claims/:id/pickup
 * @access  Private (admin/security only)
 *
 * @body    {
 *            picked_up_by_name: string (required) - name of person who picked up,
 *            id_presented: string (optional) - ID number presented
 *          }
 */
exports.recordPickup = async (req, res) => {
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
    const { picked_up_by_name, id_presented } = req.body;

    // Get claim
    const claims = await db.query(
      `SELECT c.*, fi.title as item_title,
              u.email as claimant_email, u.first_name as claimant_name
       FROM claims c
       JOIN found_items fi ON c.found_item_id = fi.id
       JOIN users u ON c.claimant_user_id = u.id
       WHERE c.id = ?`,
      [id]
    );

    if (claims.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Claim not found",
      });
    }

    const claim = claims[0];

    if (claim.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: `Cannot record pickup. Claim status must be 'approved'. Current: ${claim.status}`,
      });
    }

    if (claim.picked_up_at) {
      return res.status(400).json({
        success: false,
        message: "Item has already been picked up",
        data: {
          picked_up_at: claim.picked_up_at,
          picked_up_by_name: claim.picked_up_by_name,
        },
      });
    }

    connection = await db.beginTransaction();

    try {
      // Update claim with pickup info and set status to completed
      await connection.execute(
        `UPDATE claims SET
          status = 'completed',
          picked_up_at = NOW(),
          picked_up_by_name = ?,
          id_presented = ?,
          updated_at = NOW()
         WHERE id = ?`,
        [picked_up_by_name, id_presented || null, id]
      );

      // Update found item to resolved
      await connection.execute(
        `UPDATE found_items SET 
          status = 'resolved',
          resolved_at = NOW(),
          resolved_by = ?,
          resolution_notes = ?,
          updated_at = NOW()
         WHERE id = ?`,
        [
          req.user.id,
          `Claimed and picked up by ${picked_up_by_name}`,
          claim.found_item_id,
        ]
      );

      // Create notification
      await connection.execute(
        `INSERT INTO notifications (user_id, type, title, message, related_item_type, related_item_id)
         VALUES (?, 'item_resolved', 'Item Picked Up', ?, 'claim', ?)`,
        [
          claim.claimant_user_id,
          `Your item "${claim.item_title}" has been picked up successfully!`,
          id,
        ]
      );

      // Log activity
      await connection.execute(
        `INSERT INTO activity_logs 
         (user_id, action, resource_type, resource_id, description, ip_address, user_agent, status)
         VALUES (?, 'pickup', 'claim', ?, ?, ?, ?, 'success')`,
        [
          req.user.id,
          id,
          `Recorded pickup for claim #${id}. Picked up by: ${picked_up_by_name}`,
          req.ip || "0.0.0.0",
          req.headers["user-agent"] || "unknown",
        ]
      );

      await db.commit(connection);

      logger.info(`Pickup recorded for claim #${id} by ${picked_up_by_name}`);

      res.json({
        success: true,
        message: "Pickup recorded successfully",
        data: {
          id,
          picked_up_at: new Date().toISOString(),
          picked_up_by_name,
          id_presented,
          item_status: "resolved",
        },
      });
    } catch (error) {
      await db.rollback(connection);
      throw error;
    }
  } catch (error) {
    logger.error("Record pickup error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record pickup",
    });
  }
};

/**
 * @desc    Cancel a claim (by owner)
 * @route   PATCH /api/claims/:id/cancel
 * @access  Private (claim owner only)
 */
exports.cancelClaim = async (req, res) => {
  try {
    const { id } = req.params;

    // Get claim
    const claims = await db.query(`SELECT * FROM claims WHERE id = ?`, [id]);

    if (claims.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Claim not found",
      });
    }

    const claim = claims[0];

    // Check ownership
    if (claim.claimant_user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only cancel your own claims",
      });
    }

    // Can only cancel pending claims
    if (claim.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel claim. Current status: ${claim.status}`,
      });
    }

    // Update claim
    await db.query(
      `UPDATE claims SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [id]
    );

    // Log activity
    await db.query(
      `INSERT INTO activity_logs 
       (user_id, action, resource_type, resource_id, description, ip_address, user_agent, status)
       VALUES (?, 'cancel', 'claim', ?, 'Cancelled claim', ?, ?, 'success')`,
      [
        req.user.id,
        id,
        req.ip || "0.0.0.0",
        req.headers["user-agent"] || "unknown",
      ]
    );

    res.json({
      success: true,
      message: "Claim cancelled successfully",
    });
  } catch (error) {
    logger.error("Cancel claim error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel claim",
    });
  }
};

/**
 * @desc    Get claims for a specific found item
 * @route   GET /api/claims/item/:itemId
 * @access  Private (item owner or admin)
 */
exports.getClaimsByItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const isAdmin = req.user.role === "admin" || req.user.role === "security";

    // Check if item exists and user has access
    const items = await db.query(
      `SELECT id, user_id, title FROM found_items WHERE id = ? AND deleted_at IS NULL`,
      [itemId]
    );

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Found item not found",
      });
    }

    const item = items[0];

    // Check access
    if (!isAdmin && item.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get claims for this item
    const claims = await db.query(
      `SELECT 
        c.*,
        u.first_name as claimant_first_name,
        u.last_name as claimant_last_name,
        u.email as claimant_email,
        u.school_id as claimant_school_id,
        (SELECT COUNT(*) FROM claim_images WHERE claim_id = c.id) as image_count
       FROM claims c
       JOIN users u ON c.claimant_user_id = u.id
       WHERE c.found_item_id = ?
       ORDER BY c.created_at DESC`,
      [itemId]
    );

    res.json({
      success: true,
      data: {
        item: {
          id: item.id,
          title: item.title,
        },
        claims,
        total: claims.length,
      },
    });
  } catch (error) {
    logger.error("Get claims by item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch claims",
    });
  }
};

/**
 * @desc    Schedule pickup for approved claim
 * @route   PATCH /api/claims/:id/schedule
 * @access  Private (admin/security only)
 *
 * @body    { pickup_scheduled: datetime (required) }
 */
exports.schedulePickup = async (req, res) => {
  try {
    const { id } = req.params;
    const { pickup_scheduled } = req.body;

    if (!pickup_scheduled) {
      return res.status(400).json({
        success: false,
        message: "Pickup date/time is required",
      });
    }

    // Get claim
    const claims = await db.query(
      `SELECT c.*, fi.title as item_title,
              u.email as claimant_email, u.first_name as claimant_name
       FROM claims c
       JOIN found_items fi ON c.found_item_id = fi.id
       JOIN users u ON c.claimant_user_id = u.id
       WHERE c.id = ?`,
      [id]
    );

    if (claims.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Claim not found",
      });
    }

    const claim = claims[0];

    if (claim.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: `Can only schedule pickup for approved claims. Current status: ${claim.status}`,
      });
    }

    // Convert ISO datetime to MySQL format
    const date = new Date(pickup_scheduled);
    const mysqlPickupScheduled = date
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    // Update pickup schedule
    await db.query(
      `UPDATE claims SET pickup_scheduled = ?, updated_at = NOW() WHERE id = ?`,
      [mysqlPickupScheduled, id]
    );

    // Create notification
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, related_item_type, related_item_id)
       VALUES (?, 'system', 'Pickup Scheduled', ?, 'claim', ?)`,
      [
        claim.claimant_user_id,
        `Pickup for "${claim.item_title}" is scheduled for ${new Date(
          pickup_scheduled
        ).toLocaleString()}`,
        id,
      ]
    );

    // Send email
    try {
      await emailService.sendPickupScheduledEmail(
        {
          email: claim.claimant_email,
          first_name: claim.claimant_name,
        },
        claim.item_title,
        pickup_scheduled
      );
    } catch (emailError) {
      logger.error("Failed to send pickup scheduled email:", emailError);
    }

    res.json({
      success: true,
      message: "Pickup scheduled successfully",
      data: {
        id,
        pickup_scheduled,
      },
    });
  } catch (error) {
    logger.error("Schedule pickup error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to schedule pickup",
    });
  }
};
