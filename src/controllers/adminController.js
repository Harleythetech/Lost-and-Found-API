/**
 * Admin Dashboard Controller
 * System-wide statistics, user management, and item oversight
 *
 * FEATURES:
 * 1. System-wide statistics (users, items, claims)
 * 2. Pending items/users for review
 * 3. Recent activity monitoring
 * 4. User management (list, search, status)
 * 5. Category and Location management
 */

const db = require("../config/database");
const logger = require("../utils/logger");

// ============================================
// DASHBOARD OVERVIEW
// ============================================

/**
 * @desc    Get admin dashboard overview with all key metrics
 * @route   GET /api/admin/dashboard
 * @access  Private (Admin only)
 */
exports.getDashboardOverview = async (req, res) => {
  try {
    // User Statistics
    const [userStats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN role = 'security' THEN 1 ELSE 0 END) as security,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_this_week
      FROM users WHERE deleted_at IS NULL
    `);

    // Lost Items Statistics
    const [lostStats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) as matched,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_this_week
      FROM lost_items WHERE deleted_at IS NULL
    `);

    // Found Items Statistics
    const [foundStats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_this_week
      FROM found_items WHERE deleted_at IS NULL
    `);

    // Claims Statistics
    const [claimStats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_this_week
      FROM claims
    `);

    // Match Statistics
    const [matchStats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'suggested' THEN 1 ELSE 0 END) as suggested,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed
      FROM matches
    `);

    // Resolution Rate (items resolved / total reported)
    const totalReported = (lostStats.total || 0) + (foundStats.total || 0);
    const totalResolved =
      (lostStats.resolved || 0) + (foundStats.resolved || 0);
    const resolutionRate =
      totalReported > 0 ? Math.round((totalResolved / totalReported) * 100) : 0;

    res.json({
      success: true,
      data: {
        users: {
          total: userStats.total || 0,
          active: userStats.active || 0,
          pending: userStats.pending || 0,
          suspended: userStats.suspended || 0,
          admins: userStats.admins || 0,
          security: userStats.security || 0,
          new_this_week: userStats.new_this_week || 0,
        },
        lost_items: {
          total: lostStats.total || 0,
          pending: lostStats.pending || 0,
          approved: lostStats.approved || 0,
          matched: lostStats.matched || 0,
          resolved: lostStats.resolved || 0,
          new_this_week: lostStats.new_this_week || 0,
        },
        found_items: {
          total: foundStats.total || 0,
          pending: foundStats.pending || 0,
          approved: foundStats.approved || 0,
          claimed: foundStats.claimed || 0,
          resolved: foundStats.resolved || 0,
          new_this_week: foundStats.new_this_week || 0,
        },
        claims: {
          total: claimStats.total || 0,
          pending: claimStats.pending || 0,
          approved: claimStats.approved || 0,
          rejected: claimStats.rejected || 0,
          new_this_week: claimStats.new_this_week || 0,
        },
        matches: {
          total: matchStats.total || 0,
          suggested: matchStats.suggested || 0,
          confirmed: matchStats.confirmed || 0,
        },
        summary: {
          total_items_reported: totalReported,
          total_items_resolved: totalResolved,
          resolution_rate_percent: resolutionRate,
          pending_reviews:
            (lostStats.pending || 0) +
            (foundStats.pending || 0) +
            (claimStats.pending || 0) +
            (userStats.pending || 0),
        },
      },
    });
  } catch (error) {
    logger.error("Get admin dashboard overview error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard overview",
    });
  }
};

// ============================================
// PENDING ITEMS FOR REVIEW
// ============================================

/**
 * @desc    Get all pending items requiring admin review
 * @route   GET /api/admin/pending
 * @access  Private (Admin/Security)
 */
exports.getPendingItems = async (req, res) => {
  try {
    const { type, limit = 20 } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const result = {};

    // Pending Users (if no type filter or type=users)
    if (!type || type === "users") {
      const pendingUsers = await db.query(
        `SELECT id, school_id, first_name, last_name, email, contact_number, 
                department, year_level, created_at
         FROM users 
         WHERE status = 'pending' AND deleted_at IS NULL
         ORDER BY created_at ASC
         LIMIT ?`,
        [limitNum]
      );
      result.pending_users = pendingUsers;
    }

    // Pending Lost Items (if no type filter or type=lost)
    if (!type || type === "lost") {
      const pendingLost = await db.query(
        `SELECT li.id, li.title, li.description, li.last_seen_date, li.created_at,
                u.school_id, u.first_name, u.last_name,
                c.name as category_name, l.name as location_name
         FROM lost_items li
         JOIN users u ON li.user_id = u.id
         LEFT JOIN categories c ON li.category_id = c.id
         LEFT JOIN locations l ON li.last_seen_location_id = l.id
         WHERE li.status = 'pending' AND li.deleted_at IS NULL
         ORDER BY li.created_at ASC
         LIMIT ?`,
        [limitNum]
      );
      result.pending_lost_items = pendingLost;
    }

    // Pending Found Items (if no type filter or type=found)
    if (!type || type === "found") {
      const pendingFound = await db.query(
        `SELECT fi.id, fi.title, fi.description, fi.found_date, fi.created_at,
                u.school_id, u.first_name, u.last_name,
                c.name as category_name, l.name as location_name
         FROM found_items fi
         JOIN users u ON fi.user_id = u.id
         LEFT JOIN categories c ON fi.category_id = c.id
         LEFT JOIN locations l ON fi.found_location_id = l.id
         WHERE fi.status = 'pending' AND fi.deleted_at IS NULL
         ORDER BY fi.created_at ASC
         LIMIT ?`,
        [limitNum]
      );
      result.pending_found_items = pendingFound;
    }

    // Pending Claims (if no type filter or type=claims)
    if (!type || type === "claims") {
      const pendingClaims = await db.query(
        `SELECT c.id, c.description, c.proof_details, c.created_at,
                fi.title as item_title, fi.id as item_id,
                u.school_id, u.first_name, u.last_name, u.email
         FROM claims c
         JOIN found_items fi ON c.found_item_id = fi.id
         JOIN users u ON c.claimant_user_id = u.id
         WHERE c.status = 'pending'
         ORDER BY c.created_at ASC
         LIMIT ?`,
        [limitNum]
      );
      result.pending_claims = pendingClaims;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Get pending items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending items",
    });
  }
};

// ============================================
// USER MANAGEMENT
// ============================================

/**
 * @desc    Get all users with filtering and pagination
 * @route   GET /api/admin/users
 * @access  Private (Admin only)
 *
 * @query   status - filter by status (active, pending, suspended)
 * @query   role - filter by role (user, security, admin)
 * @query   search - search by name, email, or school_id
 * @query   page - page number (default: 1)
 * @query   limit - items per page (default: 20, max: 100)
 */
exports.getUsers = async (req, res) => {
  try {
    const { status, role, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    let whereClause = "deleted_at IS NULL";
    const params = [];

    if (status) {
      whereClause += " AND status = ?";
      params.push(status);
    }

    if (role) {
      whereClause += " AND role = ?";
      params.push(role);
    }

    if (search) {
      whereClause += ` AND (
        school_id LIKE ? OR 
        first_name LIKE ? OR 
        last_name LIKE ? OR 
        email LIKE ? OR
        CONCAT(first_name, ' ', last_name) LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM users WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get users
    const users = await db.query(
      `SELECT 
        id, school_id, email, first_name, last_name, contact_number,
        department, year_level, role, status, email_verified,
        last_login, created_at, updated_at,
        (SELECT COUNT(*) FROM lost_items WHERE user_id = users.id AND deleted_at IS NULL) as lost_items_count,
        (SELECT COUNT(*) FROM found_items WHERE user_id = users.id AND deleted_at IS NULL) as found_items_count,
        (SELECT COUNT(*) FROM claims WHERE claimant_user_id = users.id) as claims_count
       FROM users
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, parseInt(offset)]
    );

    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

/**
 * @desc    Get single user details with full history
 * @route   GET /api/admin/users/:id
 * @access  Private (Admin only)
 */
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get user details
    const users = await db.query(
      `SELECT 
        id, school_id, email, first_name, last_name, contact_number,
        date_of_birth, gender, address_line1, address_line2, city, province, postal_code,
        emergency_contact_name, emergency_contact_number, department, year_level,
        role, status, email_verified, two_factor_enabled,
        login_attempts, locked_until, last_login, 
        firebase_uid IS NOT NULL as has_firebase,
        created_at, updated_at
       FROM users
       WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    // Get user's items summary
    const [lostItems] = await db.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
       FROM lost_items WHERE user_id = ? AND deleted_at IS NULL`,
      [id]
    );

    const [foundItems] = await db.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
       FROM found_items WHERE user_id = ? AND deleted_at IS NULL`,
      [id]
    );

    const [claims] = await db.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved
       FROM claims WHERE claimant_user_id = ?`,
      [id]
    );

    // Get recent activity (last 10)
    const recentActivity = await db.query(
      `SELECT action, resource_type, description, status, created_at
       FROM activity_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...user,
        stats: {
          lost_items: {
            total: lostItems.total || 0,
            resolved: lostItems.resolved || 0,
          },
          found_items: {
            total: foundItems.total || 0,
            resolved: foundItems.resolved || 0,
          },
          claims: { total: claims.total || 0, approved: claims.approved || 0 },
        },
        recent_activity: recentActivity,
      },
    });
  } catch (error) {
    logger.error("Get user by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });
  }
};

/**
 * @desc    Update user role (promote/demote)
 * @route   PATCH /api/admin/users/:id/role
 * @access  Private (Admin only)
 *
 * @body    { role: 'user' | 'security' | 'admin' }
 */
exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const adminId = req.user.id;

    // Validate role
    const validRoles = ["user", "security", "admin"];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
      });
    }

    // Prevent self-demotion
    if (parseInt(id) === adminId && role !== "admin") {
      return res.status(400).json({
        success: false,
        message: "You cannot demote yourself",
      });
    }

    // Get user
    const users = await db.query(
      `SELECT id, school_id, role, status FROM users WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];
    const oldRole = user.role;

    if (user.role === role) {
      return res.status(400).json({
        success: false,
        message: `User already has role: ${role}`,
      });
    }

    // Update role
    await db.query(
      `UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?`,
      [role, id]
    );

    // Log activity
    await db.query(
      `INSERT INTO activity_logs (user_id, action, resource_type, resource_id, description, ip_address, status)
       VALUES (?, 'update_role', 'user', ?, ?, ?, 'success')`,
      [
        adminId,
        id,
        `Changed user ${user.school_id} role from ${oldRole} to ${role}`,
        req.ip || "0.0.0.0",
      ]
    );

    logger.info(
      `Admin ${adminId} changed user ${id} role from ${oldRole} to ${role}`
    );

    res.json({
      success: true,
      message: `User role updated to ${role}`,
      data: {
        id: user.id,
        school_id: user.school_id,
        old_role: oldRole,
        new_role: role,
      },
    });
  } catch (error) {
    logger.error("Update user role error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user role",
    });
  }
};

// ============================================
// RECENT ACTIVITY & LOGS
// ============================================

/**
 * @desc    Get system-wide recent activity
 * @route   GET /api/admin/activity
 * @access  Private (Admin only)
 *
 * @query   action - filter by action type
 * @query   user_id - filter by user
 * @query   limit - number of records (default: 50, max: 200)
 */
exports.getRecentActivity = async (req, res) => {
  try {
    const { action, user_id, limit = 50 } = req.query;
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    let whereClause = "1=1";
    const params = [];

    if (action) {
      whereClause += " AND al.action = ?";
      params.push(action);
    }

    if (user_id) {
      whereClause += " AND al.user_id = ?";
      params.push(user_id);
    }

    const activities = await db.query(
      `SELECT 
        al.id, al.action, al.resource_type, al.resource_id, 
        al.description, al.status, al.ip_address, al.created_at,
        u.school_id, u.first_name, u.last_name
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT ?`,
      [...params, limitNum]
    );

    res.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    logger.error("Get recent activity error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity logs",
    });
  }
};

// ============================================
// ITEMS MANAGEMENT
// ============================================

/**
 * @desc    Get all lost items (admin view with all statuses)
 * @route   GET /api/admin/lost-items
 * @access  Private (Admin/Security)
 */
exports.getAllLostItems = async (req, res) => {
  try {
    const { status, category_id, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    let whereClause = "li.deleted_at IS NULL";
    const params = [];

    if (status) {
      whereClause += " AND li.status = ?";
      params.push(status);
    }

    if (category_id) {
      whereClause += " AND li.category_id = ?";
      params.push(category_id);
    }

    if (search) {
      whereClause += " AND (li.title LIKE ? OR li.description LIKE ?)";
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM lost_items li WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const items = await db.query(
      `SELECT 
        li.*, 
        u.school_id, u.first_name, u.last_name, u.email,
        c.name as category_name,
        l.name as location_name,
        r.first_name as reviewer_first_name, r.last_name as reviewer_last_name,
        (SELECT file_path FROM item_images WHERE item_type = 'lost' AND item_id = li.id AND is_primary = 1 LIMIT 1) as primary_image
       FROM lost_items li
       JOIN users u ON li.user_id = u.id
       LEFT JOIN categories c ON li.category_id = c.id
       LEFT JOIN locations l ON li.last_seen_location_id = l.id
       LEFT JOIN users r ON li.reviewed_by = r.id
       WHERE ${whereClause}
       ORDER BY li.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, parseInt(offset)]
    );

    res.json({
      success: true,
      data: items,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error("Get all lost items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch lost items",
    });
  }
};

/**
 * @desc    Get all found items (admin view with all statuses)
 * @route   GET /api/admin/found-items
 * @access  Private (Admin/Security)
 */
exports.getAllFoundItems = async (req, res) => {
  try {
    const { status, category_id, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    let whereClause = "fi.deleted_at IS NULL";
    const params = [];

    if (status) {
      whereClause += " AND fi.status = ?";
      params.push(status);
    }

    if (category_id) {
      whereClause += " AND fi.category_id = ?";
      params.push(category_id);
    }

    if (search) {
      whereClause += " AND (fi.title LIKE ? OR fi.description LIKE ?)";
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM found_items fi WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const items = await db.query(
      `SELECT 
        fi.*, 
        u.school_id, u.first_name, u.last_name, u.email,
        c.name as category_name,
        l.name as found_location_name,
        sl.name as storage_location_name,
        r.first_name as reviewer_first_name, r.last_name as reviewer_last_name,
        (SELECT file_path FROM item_images WHERE item_type = 'found' AND item_id = fi.id AND is_primary = 1 LIMIT 1) as primary_image,
        (SELECT COUNT(*) FROM claims WHERE found_item_id = fi.id AND status = 'pending') as pending_claims
       FROM found_items fi
       JOIN users u ON fi.user_id = u.id
       LEFT JOIN categories c ON fi.category_id = c.id
       LEFT JOIN locations l ON fi.found_location_id = l.id
       LEFT JOIN locations sl ON fi.storage_location_id = sl.id
       LEFT JOIN users r ON fi.reviewed_by = r.id
       WHERE ${whereClause}
       ORDER BY fi.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, parseInt(offset)]
    );

    res.json({
      success: true,
      data: items,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error("Get all found items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch found items",
    });
  }
};

// ============================================
// REPORTS & ANALYTICS
// ============================================

/**
 * @desc    Get category-wise item statistics
 * @route   GET /api/admin/reports/by-category
 * @access  Private (Admin only)
 */
exports.getStatsByCategory = async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        c.id,
        c.name as category_name,
        (SELECT COUNT(*) FROM lost_items WHERE category_id = c.id AND deleted_at IS NULL) as lost_count,
        (SELECT COUNT(*) FROM found_items WHERE category_id = c.id AND deleted_at IS NULL) as found_count,
        (SELECT COUNT(*) FROM lost_items WHERE category_id = c.id AND status = 'resolved' AND deleted_at IS NULL) as lost_resolved,
        (SELECT COUNT(*) FROM found_items WHERE category_id = c.id AND status = 'resolved' AND deleted_at IS NULL) as found_resolved
      FROM categories c
      WHERE c.is_active = 1
      ORDER BY (
        (SELECT COUNT(*) FROM lost_items WHERE category_id = c.id AND deleted_at IS NULL) +
        (SELECT COUNT(*) FROM found_items WHERE category_id = c.id AND deleted_at IS NULL)
      ) DESC
    `);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Get stats by category error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch category statistics",
    });
  }
};

/**
 * @desc    Get location-wise item statistics
 * @route   GET /api/admin/reports/by-location
 * @access  Private (Admin only)
 */
exports.getStatsByLocation = async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        l.id,
        l.name as location_name,
        l.building,
        l.is_storage,
        (SELECT COUNT(*) FROM lost_items WHERE last_seen_location_id = l.id AND deleted_at IS NULL) as lost_count,
        (SELECT COUNT(*) FROM found_items WHERE found_location_id = l.id AND deleted_at IS NULL) as found_count,
        (SELECT COUNT(*) FROM found_items WHERE storage_location_id = l.id AND deleted_at IS NULL) as stored_count
      FROM locations l
      WHERE l.is_active = 1
      ORDER BY (
        (SELECT COUNT(*) FROM lost_items WHERE last_seen_location_id = l.id AND deleted_at IS NULL) +
        (SELECT COUNT(*) FROM found_items WHERE found_location_id = l.id AND deleted_at IS NULL)
      ) DESC
    `);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Get stats by location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch location statistics",
    });
  }
};

/**
 * @desc    Get time-based trends (last 30 days)
 * @route   GET /api/admin/reports/trends
 * @access  Private (Admin only)
 */
exports.getTrends = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysNum = Math.min(90, Math.max(7, parseInt(days)));

    // Daily item counts for the period
    const dailyStats = await db.query(
      `
      SELECT 
        DATE(created_at) as date,
        'lost' as type,
        COUNT(*) as count
      FROM lost_items
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND deleted_at IS NULL
      GROUP BY DATE(created_at)
      UNION ALL
      SELECT 
        DATE(created_at) as date,
        'found' as type,
        COUNT(*) as count
      FROM found_items
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND deleted_at IS NULL
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
      [daysNum, daysNum]
    );

    // Resolution stats for the period
    const [resolutionStats] = await db.query(
      `
      SELECT 
        (SELECT COUNT(*) FROM lost_items WHERE resolved_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) +
        (SELECT COUNT(*) FROM found_items WHERE resolved_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) as resolved,
        (SELECT COUNT(*) FROM claims WHERE status = 'approved' AND verified_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) as claims_approved
    `,
      [daysNum, daysNum, daysNum]
    );

    res.json({
      success: true,
      data: {
        period_days: daysNum,
        daily_stats: dailyStats,
        resolution_summary: resolutionStats,
      },
    });
  } catch (error) {
    logger.error("Get trends error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch trends",
    });
  }
};
