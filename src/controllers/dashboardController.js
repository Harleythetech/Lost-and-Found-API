/**
 * Dashboard Controller
 * Handles user dashboard data - items, claims, matches, and stats
 *
 * FEATURES:
 * - Get user's lost and found items
 * - Get user's claims
 * - Get matches for user's items
 * - Get activity statistics
 * - Get recent activity feed
 */

const db = require("../config/database");
const logger = require("../utils/logger");

/**
 * @desc    Get user dashboard overview/stats
 * @route   GET /api/dashboard
 * @access  Private
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get counts for user's items
    const [lostStats] = await db.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) as matched,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
       FROM lost_items 
       WHERE user_id = ? AND deleted_at IS NULL`,
      [userId]
    );

    const [foundStats] = await db.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
       FROM found_items 
       WHERE user_id = ? AND deleted_at IS NULL`,
      [userId]
    );

    // Get claim stats
    const [claimStats] = await db.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
       FROM claims 
       WHERE claimant_user_id = ?`,
      [userId]
    );

    // Get match count for user's items
    const [matchStats] = await db.query(
      `SELECT COUNT(DISTINCT m.id) as total
       FROM matches m
       LEFT JOIN lost_items li ON m.lost_item_id = li.id
       LEFT JOIN found_items fi ON m.found_item_id = fi.id
       WHERE (li.user_id = ? OR fi.user_id = ?) 
         AND m.status IN ('suggested', 'confirmed')`,
      [userId, userId]
    );

    // Get unread notifications count
    const [notifStats] = await db.query(
      `SELECT COUNT(*) as unread 
       FROM notifications 
       WHERE user_id = ? AND is_read = 0 
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        lost_items: {
          total: lostStats.total || 0,
          pending: lostStats.pending || 0,
          approved: lostStats.approved || 0,
          matched: lostStats.matched || 0,
          resolved: lostStats.resolved || 0,
        },
        found_items: {
          total: foundStats.total || 0,
          pending: foundStats.pending || 0,
          approved: foundStats.approved || 0,
          claimed: foundStats.claimed || 0,
          resolved: foundStats.resolved || 0,
        },
        claims: {
          total: claimStats.total || 0,
          pending: claimStats.pending || 0,
          approved: claimStats.approved || 0,
          rejected: claimStats.rejected || 0,
        },
        matches: {
          total: matchStats.total || 0,
        },
        notifications: {
          unread: notifStats.unread || 0,
        },
      },
    });
  } catch (error) {
    logger.error("Get dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard stats",
    });
  }
};

/**
 * @desc    Get user's lost items
 * @route   GET /api/dashboard/my-lost-items
 * @access  Private
 *
 * @query   status - filter by status
 * @query   page - page number (default: 1)
 * @query   limit - items per page (default: 10)
 */
exports.getMyLostItems = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "li.user_id = ? AND li.deleted_at IS NULL";
    const params = [userId];

    if (status) {
      whereClause += " AND li.status = ?";
      params.push(status);
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM lost_items li WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get items with details
    const items = await db.query(
      `SELECT 
        li.id,
        li.title,
        li.description,
        li.status,
        li.last_seen_date,
        li.last_seen_time,
        li.created_at,
        li.updated_at,
        cat.name as category_name,
        loc.name as last_seen_location,
        (SELECT file_path FROM item_images WHERE item_type = 'lost' AND item_id = li.id AND is_primary = 1 LIMIT 1) as primary_image,
        (SELECT COUNT(*) FROM matches WHERE lost_item_id = li.id AND status IN ('pending', 'confirmed')) as match_count
       FROM lost_items li
       LEFT JOIN categories cat ON li.category_id = cat.id
       LEFT JOIN locations loc ON li.last_seen_location_id = loc.id
       WHERE ${whereClause}
       ORDER BY li.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Get my lost items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch lost items",
    });
  }
};

/**
 * @desc    Get user's found items
 * @route   GET /api/dashboard/my-found-items
 * @access  Private
 *
 * @query   status - filter by status
 * @query   page - page number (default: 1)
 * @query   limit - items per page (default: 10)
 */
exports.getMyFoundItems = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "fi.user_id = ? AND fi.deleted_at IS NULL";
    const params = [userId];

    if (status) {
      whereClause += " AND fi.status = ?";
      params.push(status);
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM found_items fi WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get items with details
    const items = await db.query(
      `SELECT 
        fi.id,
        fi.title,
        fi.description,
        fi.status,
        fi.found_date,
        fi.found_time,
        fi.turned_in_to_security,
        fi.created_at,
        fi.updated_at,
        cat.name as category_name,
        loc.name as found_location,
        sloc.name as storage_location,
        (SELECT file_path FROM item_images WHERE item_type = 'found' AND item_id = fi.id AND is_primary = 1 LIMIT 1) as primary_image,
        (SELECT COUNT(*) FROM claims WHERE found_item_id = fi.id AND status = 'pending') as pending_claims
       FROM found_items fi
       LEFT JOIN categories cat ON fi.category_id = cat.id
       LEFT JOIN locations loc ON fi.found_location_id = loc.id
       LEFT JOIN locations sloc ON fi.storage_location_id = sloc.id
       WHERE ${whereClause}
       ORDER BY fi.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Get my found items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch found items",
    });
  }
};

/**
 * @desc    Get user's claims
 * @route   GET /api/dashboard/my-claims
 * @access  Private
 *
 * @query   status - filter by status (pending, approved, rejected, cancelled)
 * @query   page - page number (default: 1)
 * @query   limit - items per page (default: 10)
 */
exports.getMyClaims = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "c.claimant_user_id = ?";
    const params = [userId];

    if (status) {
      whereClause += " AND c.status = ?";
      params.push(status);
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM claims c WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get claims with item details
    const claims = await db.query(
      `SELECT 
        c.id,
        c.status,
        c.description,
        c.proof_details,
        c.verification_notes,
        c.rejection_reason,
        c.pickup_scheduled,
        c.picked_up_at,
        c.created_at,
        c.updated_at,
        fi.id as item_id,
        fi.title as item_title,
        fi.description as item_description,
        fi.status as item_status,
        cat.name as category_name,
        loc.name as found_location,
        (SELECT file_path FROM item_images WHERE item_type = 'found' AND item_id = fi.id AND is_primary = 1 LIMIT 1) as item_image
       FROM claims c
       JOIN found_items fi ON c.found_item_id = fi.id
       LEFT JOIN categories cat ON fi.category_id = cat.id
       LEFT JOIN locations loc ON fi.found_location_id = loc.id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: claims,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Get my claims error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch claims",
    });
  }
};

/**
 * @desc    Get matches for user's items
 * @route   GET /api/dashboard/my-matches
 * @access  Private
 *
 * @query   status - filter by status (pending, confirmed, rejected)
 * @query   page - page number (default: 1)
 * @query   limit - items per page (default: 10)
 */
exports.getMyMatches = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "(li.user_id = ? OR fi.user_id = ?)";
    const params = [userId, userId];

    if (status) {
      whereClause += " AND m.status = ?";
      params.push(status);
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total 
       FROM matches m
       JOIN lost_items li ON m.lost_item_id = li.id
       JOIN found_items fi ON m.found_item_id = fi.id
       WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get matches with details
    const matches = await db.query(
      `SELECT 
        m.id,
        m.status,
        m.similarity_score,
        m.match_reason,
        m.created_at,
        m.action_date,
        li.id as lost_item_id,
        li.title as lost_item_title,
        li.description as lost_item_description,
        li.user_id as lost_item_user_id,
        li.status as lost_item_status,
        fi.id as found_item_id,
        fi.title as found_item_title,
        fi.description as found_item_description,
        fi.user_id as found_item_user_id,
        fi.status as found_item_status,
        (SELECT file_path FROM item_images WHERE item_type = 'lost' AND item_id = li.id AND is_primary = 1 LIMIT 1) as lost_item_image,
        (SELECT file_path FROM item_images WHERE item_type = 'found' AND item_id = fi.id AND is_primary = 1 LIMIT 1) as found_item_image,
        CASE WHEN li.user_id = ? THEN 'lost' ELSE 'found' END as my_item_type
       FROM matches m
       JOIN lost_items li ON m.lost_item_id = li.id
       JOIN found_items fi ON m.found_item_id = fi.id
       WHERE ${whereClause}
       ORDER BY m.similarity_score DESC, m.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, ...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: matches,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Get my matches error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch matches",
    });
  }
};

/**
 * @desc    Get recent activity for user
 * @route   GET /api/dashboard/activity
 * @access  Private
 *
 * @query   limit - number of activities (default: 10, max: 50)
 */
exports.getRecentActivity = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    // Get recent activities from activity_logs
    const activities = await db.query(
      `SELECT 
        id,
        action,
        resource_type,
        resource_id,
        description,
        status,
        created_at
       FROM activity_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );

    // Get recent notifications as activities too
    const notifications = await db.query(
      `SELECT 
        id,
        type as action,
        'notification' as resource_type,
        related_item_id as resource_id,
        message as description,
        'info' as status,
        created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );

    // Combine and sort by date
    const combined = [...activities, ...notifications]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    res.json({
      success: true,
      data: combined,
    });
  } catch (error) {
    logger.error("Get recent activity error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity",
    });
  }
};

/**
 * @desc    Get claims on user's found items (items they found)
 * @route   GET /api/dashboard/claims-on-my-items
 * @access  Private
 *
 * @query   status - filter by claim status
 * @query   page - page number (default: 1)
 * @query   limit - items per page (default: 10)
 */
exports.getClaimsOnMyItems = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "fi.user_id = ?";
    const params = [userId];

    if (status) {
      whereClause += " AND c.status = ?";
      params.push(status);
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total 
       FROM claims c
       JOIN found_items fi ON c.found_item_id = fi.id
       WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get claims with claimant details
    const claims = await db.query(
      `SELECT 
        c.id,
        c.status,
        c.description,
        c.proof_details,
        c.created_at,
        fi.id as item_id,
        fi.title as item_title,
        u.id as claimant_id,
        u.first_name as claimant_first_name,
        u.last_name as claimant_last_name,
        u.school_id as claimant_school_id,
        u.email as claimant_email,
        (SELECT COUNT(*) FROM claim_images WHERE claim_id = c.id) as proof_images_count
       FROM claims c
       JOIN found_items fi ON c.found_item_id = fi.id
       JOIN users u ON c.claimant_user_id = u.id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: claims,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Get claims on my items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch claims",
    });
  }
};

/**
 * @desc    Get user profile summary
 * @route   GET /api/dashboard/profile
 * @access  Private
 */
exports.getProfileSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const users = await db.query(
      `SELECT 
        id,
        school_id,
        email,
        first_name,
        last_name,
        contact_number,
        date_of_birth,
        gender,
        address_line1,
        address_line2,
        city,
        province,
        postal_code,
        emergency_contact_name,
        emergency_contact_number,
        department,
        year_level,
        role,
        email_verified,
        email_notifications,
        last_login,
        created_at
       FROM users
       WHERE id = ? AND deleted_at IS NULL`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    // Get activity summary
    const [activityCount] = await db.query(
      `SELECT COUNT(*) as total FROM activity_logs WHERE user_id = ?`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        ...user,
        total_activities: activityCount.total || 0,
      },
    });
  } catch (error) {
    logger.error("Get profile summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/dashboard/profile
 * @access  Private
 *
 * @body    first_name - User's first name
 * @body    last_name - User's last name
 * @body    contact_number - User's contact number
 * @body    date_of_birth - Date of birth (YYYY-MM-DD)
 * @body    gender - Gender (male, female, other, prefer_not_to_say)
 * @body    address_line1 - Street address
 * @body    address_line2 - Apt/Suite/Unit (optional)
 * @body    city - City
 * @body    province - Province/State
 * @body    postal_code - Postal/ZIP code
 * @body    emergency_contact_name - Emergency contact name
 * @body    emergency_contact_number - Emergency contact phone
 * @body    department - School department/course
 * @body    year_level - Year level (e.g., 1st Year, 2nd Year)
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      first_name,
      last_name,
      contact_number,
      date_of_birth,
      gender,
      address_line1,
      address_line2,
      city,
      province,
      postal_code,
      emergency_contact_name,
      emergency_contact_number,
      department,
      year_level,
    } = req.body;

    // Get current user data
    const users = await db.query(
      "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentUser = users[0];

    // Build update fields
    const updates = {};
    const updateFields = [];
    const updateValues = [];

    // Name regex (letters, spaces, hyphens, apostrophes only)
    const nameRegex = /^[a-zA-Z\s'-]+$/;

    // PH mobile number format
    const phMobileRegex = /^(09|\+639)[0-9]{9}$/;

    // Emergency contact number format (more flexible)
    const phoneRegex = /^[0-9+\-()\s]{7,20}$/;

    // First name validation
    if (first_name !== undefined && first_name !== currentUser.first_name) {
      const trimmed = first_name ? first_name.trim() : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "First name cannot be empty",
        });
      }
      if (trimmed.length < 2 || trimmed.length > 100) {
        return res.status(400).json({
          success: false,
          message: "First name must be between 2 and 100 characters",
        });
      }
      if (!nameRegex.test(trimmed)) {
        return res.status(400).json({
          success: false,
          message:
            "First name can only contain letters, spaces, hyphens, and apostrophes",
        });
      }
      updates.first_name = trimmed;
      updateFields.push("first_name = ?");
      updateValues.push(trimmed);
    }

    // Last name validation
    if (last_name !== undefined && last_name !== currentUser.last_name) {
      const trimmed = last_name ? last_name.trim() : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Last name cannot be empty",
        });
      }
      if (trimmed.length < 2 || trimmed.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Last name must be between 2 and 100 characters",
        });
      }
      if (!nameRegex.test(trimmed)) {
        return res.status(400).json({
          success: false,
          message:
            "Last name can only contain letters, spaces, hyphens, and apostrophes",
        });
      }
      updates.last_name = trimmed;
      updateFields.push("last_name = ?");
      updateValues.push(trimmed);
    }

    // Contact number validation (PH mobile format)
    if (
      contact_number !== undefined &&
      contact_number !== currentUser.contact_number
    ) {
      const trimmed = contact_number ? contact_number.trim() : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Contact number cannot be empty",
        });
      }
      if (!phMobileRegex.test(trimmed)) {
        return res.status(400).json({
          success: false,
          message:
            "Contact number must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)",
        });
      }
      updates.contact_number = trimmed;
      updateFields.push("contact_number = ?");
      updateValues.push(trimmed);
    }

    // Date of birth validation
    if (
      date_of_birth !== undefined &&
      date_of_birth !== currentUser.date_of_birth
    ) {
      if (!date_of_birth) {
        return res.status(400).json({
          success: false,
          message: "Date of birth cannot be empty",
        });
      }
      const dob = new Date(date_of_birth);
      if (isNaN(dob.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date of birth format. Use YYYY-MM-DD",
        });
      }
      // Check reasonable age (13-120 years old)
      const age = Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      if (age < 13 || age > 120) {
        return res.status(400).json({
          success: false,
          message: "Invalid date of birth (age must be between 13 and 120)",
        });
      }
      updates.date_of_birth = date_of_birth;
      updateFields.push("date_of_birth = ?");
      updateValues.push(date_of_birth);
    }

    // Gender validation
    if (gender !== undefined && gender !== currentUser.gender) {
      const validGenders = ["male", "female", "other", "prefer_not_to_say"];
      if (!gender || !validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          message: "Gender must be male, female, other, or prefer_not_to_say",
        });
      }
      updates.gender = gender;
      updateFields.push("gender = ?");
      updateValues.push(gender);
    }

    // Address line 1 validation (required)
    if (
      address_line1 !== undefined &&
      address_line1 !== currentUser.address_line1
    ) {
      const trimmed = address_line1 ? address_line1.trim() : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Address cannot be empty",
        });
      }
      if (trimmed.length > 255) {
        return res.status(400).json({
          success: false,
          message: "Address must be less than 255 characters",
        });
      }
      updates.address_line1 = trimmed;
      updateFields.push("address_line1 = ?");
      updateValues.push(trimmed);
    }

    // Address line 2 validation (optional - can be empty)
    if (
      address_line2 !== undefined &&
      address_line2 !== currentUser.address_line2
    ) {
      const trimmed = address_line2 ? address_line2.trim() : null;
      if (trimmed && trimmed.length > 255) {
        return res.status(400).json({
          success: false,
          message: "Address line 2 must be less than 255 characters",
        });
      }
      updates.address_line2 = trimmed;
      updateFields.push("address_line2 = ?");
      updateValues.push(trimmed);
    }

    // City validation (required)
    if (city !== undefined && city !== currentUser.city) {
      const trimmed = city ? city.trim() : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "City cannot be empty",
        });
      }
      if (trimmed.length > 100) {
        return res.status(400).json({
          success: false,
          message: "City must be less than 100 characters",
        });
      }
      updates.city = trimmed;
      updateFields.push("city = ?");
      updateValues.push(trimmed);
    }

    // Province validation (required)
    if (province !== undefined && province !== currentUser.province) {
      const trimmed = province ? province.trim() : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Province cannot be empty",
        });
      }
      if (trimmed.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Province must be less than 100 characters",
        });
      }
      updates.province = trimmed;
      updateFields.push("province = ?");
      updateValues.push(trimmed);
    }

    // Postal code validation (required)
    if (postal_code !== undefined && postal_code !== currentUser.postal_code) {
      const trimmed = postal_code ? postal_code.trim() : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Postal code cannot be empty",
        });
      }
      if (trimmed.length > 20) {
        return res.status(400).json({
          success: false,
          message: "Postal code must be less than 20 characters",
        });
      }
      updates.postal_code = trimmed;
      updateFields.push("postal_code = ?");
      updateValues.push(trimmed);
    }

    // Emergency contact name validation (required)
    if (
      emergency_contact_name !== undefined &&
      emergency_contact_name !== currentUser.emergency_contact_name
    ) {
      const trimmed = emergency_contact_name
        ? emergency_contact_name.trim()
        : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Emergency contact name cannot be empty",
        });
      }
      if (trimmed.length > 200) {
        return res.status(400).json({
          success: false,
          message: "Emergency contact name must be less than 200 characters",
        });
      }
      updates.emergency_contact_name = trimmed;
      updateFields.push("emergency_contact_name = ?");
      updateValues.push(trimmed);
    }

    // Emergency contact number validation (required)
    if (
      emergency_contact_number !== undefined &&
      emergency_contact_number !== currentUser.emergency_contact_number
    ) {
      const trimmed = emergency_contact_number
        ? emergency_contact_number.trim()
        : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Emergency contact number cannot be empty",
        });
      }
      if (!phoneRegex.test(trimmed)) {
        return res.status(400).json({
          success: false,
          message: "Invalid emergency contact number format",
        });
      }
      updates.emergency_contact_number = trimmed;
      updateFields.push("emergency_contact_number = ?");
      updateValues.push(trimmed);
    }

    // Department validation (required)
    if (department !== undefined && department !== currentUser.department) {
      const trimmed = department ? department.trim() : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Department cannot be empty",
        });
      }
      if (trimmed.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Department must be less than 100 characters",
        });
      }
      updates.department = trimmed;
      updateFields.push("department = ?");
      updateValues.push(trimmed);
    }

    // Year level validation (required)
    if (year_level !== undefined && year_level !== currentUser.year_level) {
      const trimmed = year_level ? year_level.trim() : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Year level cannot be empty",
        });
      }
      if (trimmed.length > 50) {
        return res.status(400).json({
          success: false,
          message: "Year level must be less than 50 characters",
        });
      }
      updates.year_level = trimmed;
      updateFields.push("year_level = ?");
      updateValues.push(trimmed);
    }

    // Check if there are any updates
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No changes provided",
      });
    }

    // Add updated_at
    updateFields.push("updated_at = NOW()");
    updateValues.push(userId);

    // Perform update
    await db.query(
      `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`,
      updateValues
    );

    // Log the activity
    await db.query(
      `INSERT INTO activity_logs (user_id, action, resource_type, resource_id, description, status, created_at)
       VALUES (?, 'update', 'user', ?, 'Updated profile information', 'success', NOW())`,
      [userId, userId]
    );

    // Get updated user data
    const updatedUsers = await db.query(
      `SELECT 
        id,
        school_id,
        email,
        first_name,
        last_name,
        contact_number,
        date_of_birth,
        gender,
        address_line1,
        address_line2,
        city,
        province,
        postal_code,
        emergency_contact_name,
        emergency_contact_number,
        department,
        year_level,
        role,
        email_verified,
        email_notifications,
        last_login,
        created_at,
        updated_at
       FROM users
       WHERE id = ?`,
      [userId]
    );

    logger.info(`User ${userId} updated profile`, {
      updates: Object.keys(updates),
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUsers[0],
    });
  } catch (error) {
    logger.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
};

/**
 * @desc    Change user password
 * @route   PUT /api/dashboard/profile/password
 * @access  Private
 *
 * @body    current_password - Current password
 * @body    new_password - New password (min 8 chars, must include uppercase, lowercase, number)
 */
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    // Validate input
    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    // Validate new password strength
    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    if (
      !/[A-Z]/.test(new_password) ||
      !/[a-z]/.test(new_password) ||
      !/[0-9]/.test(new_password)
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must include uppercase, lowercase, and a number",
      });
    }

    // Get current user with password
    const users = await db.query(
      "SELECT id, password_hash FROM users WHERE id = ? AND deleted_at IS NULL",
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify current password
    const bcrypt = require("bcrypt");
    const isMatch = await bcrypt.compare(
      current_password,
      users[0].password_hash
    );

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Check if new password is same as current
    const isSame = await bcrypt.compare(new_password, users[0].password_hash);
    if (isSame) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(new_password, salt);

    // Update password
    await db.query(
      "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
      [hashedPassword, userId]
    );

    // Log the activity
    await db.query(
      `INSERT INTO activity_logs (user_id, action, resource_type, resource_id, description, status, created_at)
       VALUES (?, 'update', 'user', ?, 'Changed password', 'success', NOW())`,
      [userId, userId]
    );

    logger.info(`User ${userId} changed password`);

    // Send email notification
    try {
      const emailService = require("../services/emailService");
      const userDetails = await db.query(
        "SELECT email, first_name FROM users WHERE id = ?",
        [userId]
      );
      if (userDetails.length > 0) {
        await emailService.sendEmail({
          to: userDetails[0].email,
          subject: "Password Changed Successfully",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Password Changed</h2>
              <p>Hi ${userDetails[0].first_name},</p>
              <p>Your password has been successfully changed.</p>
              <p>If you did not make this change, please contact support immediately.</p>
              <p>Best regards,<br>Lost and Found Team</p>
            </div>
          `,
          skipPreferenceCheck: true, // Security emails always sent
        });
      }
    } catch (emailError) {
      logger.error("Failed to send password change email:", emailError);
    }

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    logger.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change password",
    });
  }
};
