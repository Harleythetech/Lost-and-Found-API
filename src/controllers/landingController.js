/**
 * Landing Controller
 * Handles home/landing page data - display only, no search or view details
 *
 * PURPOSE:
 * Provides a simple showcase of recent lost and found items for the landing page.
 * This is purely for display - no search, no filtering, no view details.
 */

const db = require("../config/database");
const logger = require("../utils/logger");
const { getFileUrl } = require("../utils/fileUpload");

/**
 * @desc    Get landing page data (recent items for display only)
 * @route   GET /api/landing
 * @access  Public
 *
 * Returns limited recent items for showcase - no search, no pagination
 */
exports.getLandingItems = async (req, res) => {
  try {
    // Get recent approved lost items (limit 6 for display)
    const lostItems = await db.query(
      `SELECT 
        li.id,
        li.title,
        li.category_id,
        li.last_seen_date,
        li.created_at,
        c.name as category,
        l.name as last_seen_location,
        (SELECT file_path FROM item_images 
         WHERE item_type = 'lost' AND item_id = li.id AND is_primary = TRUE 
         LIMIT 1) as primary_image
       FROM lost_items li
       JOIN categories c ON li.category_id = c.id
       LEFT JOIN locations l ON li.last_seen_location_id = l.id
       WHERE li.deleted_at IS NULL AND li.status = 'approved'
       ORDER BY li.created_at DESC
       LIMIT 6`
    );

    // Get recent approved found items (limit 6 for display)
    const foundItems = await db.query(
      `SELECT 
        fi.id,
        fi.title,
        fi.category_id,
        fi.found_date,
        fi.created_at,
        c.name as category,
        l.name as found_location,
        (SELECT file_path FROM item_images 
         WHERE item_type = 'found' AND item_id = fi.id AND is_primary = TRUE 
         LIMIT 1) as primary_image
       FROM found_items fi
       JOIN categories c ON fi.category_id = c.id
       LEFT JOIN locations l ON fi.found_location_id = l.id
       WHERE fi.deleted_at IS NULL AND fi.status = 'approved'
       ORDER BY fi.created_at DESC
       LIMIT 6`
    );

    // Format image URLs
    lostItems.forEach((item) => {
      item.primary_image = item.primary_image
        ? getFileUrl(item.primary_image)
        : null;
    });

    foundItems.forEach((item) => {
      item.primary_image = item.primary_image
        ? getFileUrl(item.primary_image)
        : null;
    });

    // Get counts for stats display
    const [lostCount] = await db.query(
      `SELECT COUNT(*) as total FROM lost_items WHERE deleted_at IS NULL AND status = 'approved'`
    );

    const [foundCount] = await db.query(
      `SELECT COUNT(*) as total FROM found_items WHERE deleted_at IS NULL AND status = 'approved'`
    );

    const [resolvedCount] = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM lost_items WHERE status = 'resolved' AND deleted_at IS NULL) +
        (SELECT COUNT(*) FROM found_items WHERE status = 'resolved' AND deleted_at IS NULL) as total`
    );

    res.json({
      success: true,
      data: {
        lost_items: lostItems,
        found_items: foundItems,
        stats: {
          total_lost: lostCount.total || 0,
          total_found: foundCount.total || 0,
          total_resolved: resolvedCount.total || 0,
        },
      },
    });
  } catch (error) {
    logger.error("Get landing items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch landing page data",
    });
  }
};

/**
 * @desc    Get active categories for landing page display
 * @route   GET /api/landing/categories
 * @access  Public
 */
exports.getLandingCategories = async (req, res) => {
  try {
    const categories = await db.query(
      `SELECT id, name, description, icon
       FROM categories
       WHERE status = 'active' AND deleted_at IS NULL
       ORDER BY name ASC`
    );

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error("Get landing categories error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
    });
  }
};
