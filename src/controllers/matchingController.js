/**
 * Matching Controller
 * Handles match-related endpoints
 */

const { validationResult } = require("express-validator");
const db = require("../config/database");
const matchingService = require("../services/matchingService");

/**
 * Find matches for a lost item
 * GET /api/matches/lost/:id
 * Access: Item owner or admin
 */
exports.getMatchesForLostItem = async (req, res) => {
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
    const lostItems = await db.query(
      "SELECT user_id FROM lost_items WHERE id = ?",
      [id]
    );

    if (lostItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Lost item not found",
      });
    }

    const isOwner = lostItems[0].user_id === req.user.id;
    const isAdmin = ["admin", "security"].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const matches = await matchingService.findMatchesForLostItem(id);

    // Auto-save top matches to database
    for (const match of matches.slice(0, 5)) {
      await matchingService.saveMatch(
        id,
        match.found_item_id,
        match.match_score,
        match.confidence
      );
    }

    // Add similarity_score alias for compatibility
    const formattedMatches = matches.map((m) => ({
      ...m,
      similarity_score: m.match_score,
    }));

    res.json({
      success: true,
      data: formattedMatches,
      meta: {
        lost_item_id: parseInt(id),
        total_matches: formattedMatches.length,
      },
    });
  } catch (error) {
    console.error("Get lost item matches error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to find matches",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Find matches for a found item
 * GET /api/matches/found/:id
 * Access: Item owner or admin
 */
exports.getMatchesForFoundItem = async (req, res) => {
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
    const foundItems = await db.query(
      "SELECT user_id FROM found_items WHERE id = ?",
      [id]
    );

    if (foundItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Found item not found",
      });
    }

    const isOwner = foundItems[0].user_id === req.user.id;
    const isAdmin = ["admin", "security"].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const matches = await matchingService.findMatchesForFoundItem(id);

    // Auto-save top matches to database
    for (const match of matches.slice(0, 5)) {
      await matchingService.saveMatch(
        match.lost_item_id,
        id,
        match.match_score,
        match.confidence
      );
    }

    // Add similarity_score alias for compatibility
    const formattedMatches = matches.map((m) => ({
      ...m,
      similarity_score: m.match_score,
    }));

    res.json({
      success: true,
      data: formattedMatches,
      meta: {
        found_item_id: parseInt(id),
        total_matches: formattedMatches.length,
      },
    });
  } catch (error) {
    console.error("Get found item matches error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to find matches",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get saved matches for a user's lost items
 * GET /api/matches/my-lost-items
 * Access: Authenticated user
 */
exports.getMyLostItemMatches = async (req, res) => {
  try {
    const userId = req.user.id;

    const matches = await db.query(
      `SELECT 
        m.*,
        li.title as lost_item_title,
        fi.title as found_item_title,
        fi.found_date,
        fi.storage_location_id,
        fi.storage_notes,
        c.name as category_name
       FROM matches m
       JOIN lost_items li ON m.lost_item_id = li.id
       JOIN found_items fi ON m.found_item_id = fi.id
       JOIN categories c ON li.category_id = c.id
       WHERE li.user_id = ?
         AND m.status = 'suggested'
         AND m.similarity_score >= 50
       ORDER BY m.similarity_score DESC, m.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: matches,
    });
  } catch (error) {
    console.error("Get user matches error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch matches",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Accept a match (user confirms this is their item)
 * POST /api/matches/:id/accept
 * Access: Lost item owner
 */
exports.acceptMatch = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    // Get match details
    const matches = await db.query(
      `SELECT m.*, li.user_id 
       FROM matches m
       JOIN lost_items li ON m.lost_item_id = li.id
       WHERE m.id = ?`,
      [id]
    );

    if (matches.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    const match = matches[0];

    // Check ownership
    if (match.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Update match status
    await db.query(
      `UPDATE matches 
       SET status = 'confirmed', action_date = CURRENT_TIMESTAMP, confirmed_by = ?
       WHERE id = ?`,
      [req.user.id, id]
    );

    // Create notification for found item owner
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, related_item_id, related_item_type)
       SELECT fi.user_id, 'match_found', 
              'Match Confirmed', 
              'Someone confirmed a match for your found item', 
              fi.id, 'found'
       FROM found_items fi
       WHERE fi.id = ?`,
      [match.found_item_id]
    );

    res.json({
      success: true,
      message:
        "Match confirmed successfully. You can now proceed to claim the item.",
    });
  } catch (error) {
    console.error("Accept match error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to accept match",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Reject a match (not the right item)
 * POST /api/matches/:id/reject
 * Access: Lost item owner
 */
exports.rejectMatch = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    // Get match details
    const matches = await db.query(
      `SELECT m.*, li.user_id 
       FROM matches m
       JOIN lost_items li ON m.lost_item_id = li.id
       WHERE m.id = ?`,
      [id]
    );

    if (matches.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    const match = matches[0];

    // Check ownership
    if (match.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Update match status
    await db.query(
      `UPDATE matches 
       SET status = 'dismissed', action_date = CURRENT_TIMESTAMP, dismissed_by = ?
       WHERE id = ?`,
      [req.user.id, id]
    );

    res.json({
      success: true,
      message: "Match rejected",
    });
  } catch (error) {
    console.error("Reject match error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject match",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Run auto-matching for all items
 * POST /api/matches/run-auto-match
 * Access: Admin only
 */
exports.runAutoMatching = async (req, res) => {
  try {
    const results = await matchingService.runAutoMatching();

    res.json({
      success: true,
      message: "Auto-matching completed",
      data: results,
    });
  } catch (error) {
    console.error("Auto-matching error:", error);
    res.status(500).json({
      success: false,
      message: "Auto-matching failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get Saved Matches for Item
 * GET /api/matches/saved/:itemType/:itemId
 * Access: Private (owner or admin)
 */
exports.getSavedMatches = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { itemType, itemId } = req.params;
    const { status } = req.query;

    // Validate item type
    if (!["lost", "found"].includes(itemType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item type. Must be 'lost' or 'found'",
      });
    }

    // Check ownership or admin
    const table = itemType === "lost" ? "lost_items" : "found_items";
    const items = await db.query(`SELECT user_id FROM ${table} WHERE id = ?`, [
      itemId,
    ]);

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: `${itemType} item not found`,
      });
    }

    const isOwner = items[0].user_id === req.user.id;
    const isAdmin = ["admin", "security"].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Build query based on item type
    let query;
    let params = [itemId];

    // Debug: Check raw matches both ways
    const column = itemType === "lost" ? "lost_item_id" : "found_item_id";
    const rawMatches = await db.query(
      `SELECT * FROM matches WHERE ${column} = ?`,
      [itemId]
    );
    console.log(`Checking matches where ${column} = ${itemId}`);
    console.log("Raw matches in DB:", rawMatches.length);
    if (rawMatches.length > 0) {
      console.log("Sample raw match:", rawMatches[0]);
    } else {
      // Check the other column
      const otherColumn =
        itemType === "lost" ? "found_item_id" : "lost_item_id";
      const otherMatches = await db.query(
        `SELECT * FROM matches WHERE ${otherColumn} = ?`,
        [itemId]
      );
      console.log(
        `  -> No matches. Checked opposite: ${otherColumn} = ${itemId}, found ${otherMatches.length} matches`
      );
      console.log(
        `  -> Item ${itemId} is actually a ${
          itemType === "lost" ? "FOUND" : "LOST"
        } item!`
      );
    }

    if (itemType === "lost") {
      query = `
        SELECT m.*, 
               fi.title as found_title,
               fi.description as found_description,
               fi.category_id as found_category_id,
               c.name as category_name,
               fi.found_location_id,
               l.name as location_name,
               fi.found_date,
               fi.storage_location_id,
               fi.storage_notes
        FROM matches m
        JOIN found_items fi ON m.found_item_id = fi.id AND fi.deleted_at IS NULL
        LEFT JOIN categories c ON fi.category_id = c.id
        LEFT JOIN locations l ON fi.found_location_id = l.id
        WHERE m.lost_item_id = ?
      `;
    } else {
      query = `
        SELECT m.*, 
               li.title as lost_title,
               li.description as lost_description,
               li.category_id as lost_category_id,
               c.name as category_name,
               li.lost_location_id,
               l.name as location_name,
               li.lost_date
        FROM matches m
        JOIN lost_items li ON m.lost_item_id = li.id AND li.deleted_at IS NULL
        LEFT JOIN categories c ON li.category_id = c.id
        LEFT JOIN locations l ON li.lost_location_id = l.id
        WHERE m.found_item_id = ?
      `;
    }

    // Add status filter if provided
    if (status) {
      query += " AND m.status = ?";
      params.push(status);
    }

    query += " ORDER BY m.similarity_score DESC, m.created_at DESC";

    console.log("Query:", query);
    console.log("Params:", params);

    const matches = await db.query(query, params);

    console.log("Matches found:", matches.length);
    console.log("First match:", matches[0]);

    res.json({
      success: true,
      data: matches,
    });
  } catch (error) {
    console.error("Get saved matches error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve saved matches",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Update Match Status
 * PATCH /api/matches/:matchId/status
 * Access: Private (owner)
 */
exports.updateMatchStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { matchId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ["suggested", "confirmed", "dismissed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Check if match exists and verify ownership
    const matches = await db.query(
      `SELECT m.*, li.user_id as lost_user_id, fi.user_id as found_user_id
       FROM matches m
       JOIN lost_items li ON m.lost_item_id = li.id
       JOIN found_items fi ON m.found_item_id = fi.id
       WHERE m.id = ?`,
      [matchId]
    );

    if (matches.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    const match = matches[0];
    const isOwner =
      match.lost_user_id === req.user.id || match.found_user_id === req.user.id;
    const isAdmin = ["admin", "security"].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Update match status with user tracking
    const updateField =
      status === "confirmed"
        ? "confirmed_by"
        : status === "dismissed"
        ? "dismissed_by"
        : null;

    if (updateField) {
      await db.query(
        `UPDATE matches SET status = ?, ${updateField} = ?, action_date = NOW() WHERE id = ?`,
        [status, req.user.id, matchId]
      );
    } else {
      await db.query(
        "UPDATE matches SET status = ?, action_date = NOW() WHERE id = ?",
        [status, matchId]
      );
    }

    // Get updated match
    const updated = await db.query(
      `SELECT m.*, 
              li.title as lost_title,
              fi.title as found_title,
              c.name as category_name
       FROM matches m
       JOIN lost_items li ON m.lost_item_id = li.id
       JOIN found_items fi ON m.found_item_id = fi.id
       LEFT JOIN categories c ON li.category_id = c.id
       WHERE m.id = ?`,
      [matchId]
    );

    res.json({
      success: true,
      message: `Match status updated to ${status}`,
      data: updated[0],
    });
  } catch (error) {
    console.error("Update match status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update match status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = exports;
