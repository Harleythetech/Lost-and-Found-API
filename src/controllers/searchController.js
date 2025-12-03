/**
 * Search Controller
 * Handles search operations for lost and found items
 */

const { validationResult } = require("express-validator");
const db = require("../config/database");
const { formatValidationErrors } = require("../utils/validationErrorFormatter");

/**
 * Sanitize string for SQL LIKE queries
 * Escapes special characters: %, _, and \
 * @param {string} str - Input string to sanitize
 * @returns {string} Sanitized string safe for LIKE queries
 */
const sanitizeForLike = (str) => {
  if (!str) return str;
  return str
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/%/g, "\\%") // Escape percent
    .replace(/_/g, "\\_"); // Escape underscore
};

/**
 * Search Lost Items
 * GET /api/search/lost
 * Access: Public (approved items only) / Admin & Security (all items)
 *
 * Query Parameters:
 * - q: Search query (title, description)
 * - category_id: Filter by category
 * - lost_location_id: Filter by location
 * - date_from: Filter by lost date (from)
 * - date_to: Filter by lost date (to)
 * - status: Filter by status (admin/security only)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 */
exports.searchLostItems = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(formatValidationErrors(errors.array()));
    }

    const {
      q,
      category_id,
      lost_location_id,
      date_from,
      date_to,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    // Check if user is admin/security
    const isPrivileged =
      req.user && ["admin", "security"].includes(req.user.role);

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    const conditions = ["li.deleted_at IS NULL"];
    const params = [];

    // Public/regular users only see approved items
    // Admin/security can see all items and filter by status
    if (!isPrivileged) {
      conditions.push("li.status = 'approved'");
    } else if (status) {
      // Admin/security can filter by status
      conditions.push("li.status = ?");
      params.push(status);
    }

    // Search query (title and description)
    if (q && q.trim()) {
      conditions.push("(li.title LIKE ? OR li.description LIKE ?)");
      const sanitizedQuery = sanitizeForLike(q.trim());
      const searchTerm = `%${sanitizedQuery}%`;
      params.push(searchTerm, searchTerm);
    }

    // Category filter
    if (category_id) {
      conditions.push("li.category_id = ?");
      params.push(category_id);
    }

    // Location filter
    if (lost_location_id) {
      conditions.push("li.last_seen_location_id = ?");
      params.push(lost_location_id);
    }

    // Date range filter
    if (date_from) {
      conditions.push("li.last_seen_date >= ?");
      params.push(date_from);
    }
    if (date_to) {
      conditions.push("li.last_seen_date <= ?");
      params.push(date_to);
    }

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM lost_items li
      WHERE ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = countResult[0].total;

    // Select fields based on role - hide sensitive contact info for public
    const selectFields = isPrivileged
      ? `li.*,
        c.name as category_name,
        l.name as location_name,
        u.school_id,
        u.first_name,
        u.last_name,
        u.email,
        u.contact_number`
      : `li.id, li.title, li.description, li.category_id, li.last_seen_location_id,
        li.last_seen_date, li.last_seen_time, li.status, li.created_at, li.updated_at,
        c.name as category_name,
        l.name as location_name,
        u.school_id,
        u.first_name,
        u.last_name`;

    // Get paginated results
    const query = `
      SELECT 
        ${selectFields}
      FROM lost_items li
      LEFT JOIN categories c ON li.category_id = c.id
      LEFT JOIN locations l ON li.last_seen_location_id = l.id
      LEFT JOIN users u ON li.user_id = u.id
      WHERE ${whereClause}
      ORDER BY li.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const items = await db.query(query, [...params, limitNum, offset]);

    res.json({
      success: true,
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        pages: Math.ceil(total / limitNum),
      },
      filters: {
        q,
        category_id,
        lost_location_id,
        date_from,
        date_to,
        ...(isPrivileged && { status }),
      },
    });
  } catch (error) {
    console.error("Search lost items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search lost items",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Search Found Items
 * GET /api/search/found
 * Access: Public (approved items only) / Admin & Security (all items)
 *
 * Query Parameters:
 * - q: Search query (title, description)
 * - category_id: Filter by category
 * - found_location_id: Filter by location
 * - date_from: Filter by found date (from)
 * - date_to: Filter by found date (to)
 * - status: Filter by status (admin/security only)
 * - storage_location_id: Filter by storage location
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 */
exports.searchFoundItems = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(formatValidationErrors(errors.array()));
    }

    const {
      q,
      category_id,
      found_location_id,
      date_from,
      date_to,
      status,
      storage_location_id,
      page = 1,
      limit = 20,
    } = req.query;

    // Check if user is admin/security
    const isPrivileged =
      req.user && ["admin", "security"].includes(req.user.role);

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    const conditions = ["fi.deleted_at IS NULL"];
    const params = [];

    // Public/regular users only see approved items
    // Admin/security can see all items and filter by status
    if (!isPrivileged) {
      conditions.push("fi.status = 'approved'");
    } else if (status) {
      // Admin/security can filter by status
      conditions.push("fi.status = ?");
      params.push(status);
    }

    // Search query (title and description)
    if (q && q.trim()) {
      conditions.push("(fi.title LIKE ? OR fi.description LIKE ?)");
      const sanitizedQuery = sanitizeForLike(q.trim());
      const searchTerm = `%${sanitizedQuery}%`;
      params.push(searchTerm, searchTerm);
    }

    // Category filter
    if (category_id) {
      conditions.push("fi.category_id = ?");
      params.push(category_id);
    }

    // Location filter
    if (found_location_id) {
      conditions.push("fi.found_location_id = ?");
      params.push(found_location_id);
    }

    // Date range filter
    if (date_from) {
      conditions.push("fi.found_date >= ?");
      params.push(date_from);
    }
    if (date_to) {
      conditions.push("fi.found_date <= ?");
      params.push(date_to);
    }

    // Storage location filter
    if (storage_location_id) {
      conditions.push("fi.storage_location_id = ?");
      params.push(storage_location_id);
    }

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM found_items fi
      WHERE ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = countResult[0].total;

    // Select fields based on role - hide sensitive info for public
    const selectFields = isPrivileged
      ? `fi.*,
        c.name as category_name,
        l.name as found_location_name,
        sl.name as storage_location_name,
        u.school_id as reporter_school_id,
        u.first_name as reporter_first_name,
        u.last_name as reporter_last_name,
        u.email as reporter_email,
        u.contact_number as reporter_contact`
      : `fi.id, fi.title, fi.description, fi.category_id, fi.found_location_id,
        fi.found_date, fi.found_time, fi.status, fi.created_at, fi.updated_at,
        c.name as category_name,
        l.name as found_location_name,
        sl.name as storage_location_name,
        u.school_id as reporter_school_id,
        u.first_name as reporter_first_name,
        u.last_name as reporter_last_name`;

    // Get paginated results
    const query = `
      SELECT 
        ${selectFields}
      FROM found_items fi
      LEFT JOIN categories c ON fi.category_id = c.id
      LEFT JOIN locations l ON fi.found_location_id = l.id
      LEFT JOIN locations sl ON fi.storage_location_id = sl.id
      LEFT JOIN users u ON fi.user_id = u.id
      WHERE ${whereClause}
      ORDER BY fi.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const items = await db.query(query, [...params, limitNum, offset]);

    res.json({
      success: true,
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        pages: Math.ceil(total / limitNum),
      },
      filters: {
        q,
        category_id,
        found_location_id,
        date_from,
        date_to,
        storage_location_id,
        ...(isPrivileged && { status }),
      },
    });
  } catch (error) {
    console.error("Search found items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search found items",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Combined Search (both lost and found items)
 * GET /api/search/all
 * Access: Public (approved items only) / Admin & Security (all items)
 *
 * Returns both lost and found items matching the search criteria
 */
exports.searchAll = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(formatValidationErrors(errors.array()));
    }

    const {
      q,
      category_id,
      location_id,
      date_from,
      date_to,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    // Check if user is admin/security
    const isPrivileged =
      req.user && ["admin", "security"].includes(req.user.role);

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    // Build WHERE conditions for lost items
    const lostConditions = ["li.deleted_at IS NULL"];
    const lostParams = [];

    // Public/regular users only see approved items
    if (!isPrivileged) {
      lostConditions.push("li.status = 'approved'");
    } else if (status) {
      lostConditions.push("li.status = ?");
      lostParams.push(status);
    }

    if (q && q.trim()) {
      const sanitizedQuery = sanitizeForLike(q.trim());
      const searchTerm = `%${sanitizedQuery}%`;
      lostConditions.push("(li.title LIKE ? OR li.description LIKE ?)");
      lostParams.push(searchTerm, searchTerm);
    }
    if (category_id) {
      lostConditions.push("li.category_id = ?");
      lostParams.push(category_id);
    }
    if (location_id) {
      lostConditions.push("li.last_seen_location_id = ?");
      lostParams.push(location_id);
    }
    if (date_from) {
      lostConditions.push("li.last_seen_date >= ?");
      lostParams.push(date_from);
    }
    if (date_to) {
      lostConditions.push("li.last_seen_date <= ?");
      lostParams.push(date_to);
    }

    const lostWhereClause = lostConditions.join(" AND ");

    // Search lost items - select fields based on role
    const lostQuery = `
      SELECT 
        li.id,
        'lost' as item_type,
        li.title,
        li.description,
        li.category_id,
        c.name as category_name,
        li.last_seen_location_id as location_id,
        l.name as location_name,
        li.last_seen_date as date,
        li.status,
        li.created_at,
        u.school_id,
        u.first_name,
        u.last_name
      FROM lost_items li
      LEFT JOIN categories c ON li.category_id = c.id
      LEFT JOIN locations l ON li.last_seen_location_id = l.id
      LEFT JOIN users u ON li.user_id = u.id
      WHERE ${lostWhereClause}
    `;

    // Build WHERE conditions for found items
    const foundConditions = ["fi.deleted_at IS NULL"];
    const foundParams = [];

    // Public/regular users only see approved items
    if (!isPrivileged) {
      foundConditions.push("fi.status = 'approved'");
    } else if (status) {
      foundConditions.push("fi.status = ?");
      foundParams.push(status);
    }

    if (q && q.trim()) {
      const sanitizedQuery = sanitizeForLike(q.trim());
      const searchTerm = `%${sanitizedQuery}%`;
      foundConditions.push("(fi.title LIKE ? OR fi.description LIKE ?)");
      foundParams.push(searchTerm, searchTerm);
    }
    if (category_id) {
      foundConditions.push("fi.category_id = ?");
      foundParams.push(category_id);
    }
    if (location_id) {
      foundConditions.push("fi.found_location_id = ?");
      foundParams.push(location_id);
    }
    if (date_from) {
      foundConditions.push("fi.found_date >= ?");
      foundParams.push(date_from);
    }
    if (date_to) {
      foundConditions.push("fi.found_date <= ?");
      foundParams.push(date_to);
    }

    const foundWhereClause = foundConditions.join(" AND ");

    // Search found items
    const foundQuery = `
      SELECT 
        fi.id,
        'found' as item_type,
        fi.title,
        fi.description,
        fi.category_id,
        c.name as category_name,
        fi.found_location_id as location_id,
        l.name as location_name,
        fi.found_date as date,
        fi.status,
        fi.created_at,
        u.school_id,
        u.first_name,
        u.last_name
      FROM found_items fi
      LEFT JOIN categories c ON fi.category_id = c.id
      LEFT JOIN locations l ON fi.found_location_id = l.id
      LEFT JOIN users u ON fi.user_id = u.id
      WHERE ${foundWhereClause}
    `;

    // Combine results
    const combinedQuery = `
      SELECT * FROM (
        ${lostQuery}
        UNION ALL
        ${foundQuery}
      ) combined
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const allParams = [...lostParams, ...foundParams]; // Params for both queries
    const offset = (pageNum - 1) * limitNum;
    const items = await db.query(combinedQuery, [
      ...allParams,
      limitNum,
      offset,
    ]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total FROM (
        ${lostQuery}
        UNION ALL
        ${foundQuery}
      ) combined
    `;
    const countResult = await db.query(countQuery, allParams);
    const total = countResult[0].total;

    res.json({
      success: true,
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        pages: Math.ceil(total / limitNum),
      },
      filters: {
        q,
        category_id,
        location_id,
        date_from,
        date_to,
        ...(isPrivileged && { status }),
      },
    });
  } catch (error) {
    console.error("Search all items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search items",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = exports;
