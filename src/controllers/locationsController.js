/**
 * Locations Controller
 * Manages campus locations (Library, Cafeteria, etc.)
 */

const db = require("../config/database");
const { validationResult } = require("express-validator");

/**
 * Get All Locations
 * GET /api/locations
 * Access: Public
 */
exports.getLocations = async (req, res) => {
  try {
    const { active_only = "true", storage_only } = req.query;

    let query =
      "SELECT *, is_storage as is_storage_location FROM locations WHERE 1=1";
    let params = [];

    if (active_only === "true") {
      query += " AND is_active = TRUE";
    }

    if (storage_only === "true") {
      query += " AND is_storage = TRUE";
    }

    query += " ORDER BY name ASC";

    const locations = await db.query(query, params);

    // Convert boolean values
    const formattedLocations = locations.map((loc) => ({
      ...loc,
      is_storage_location: Boolean(loc.is_storage_location),
      is_active: Boolean(loc.is_active),
    }));

    res.json({
      success: true,
      data: formattedLocations,
    });
  } catch (error) {
    console.error("Get locations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch locations",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get Single Location
 * GET /api/locations/:id
 * Access: Public
 */
exports.getLocationById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    const locations = await db.query(
      "SELECT *, is_storage as is_storage_location FROM locations WHERE id = ?",
      [id]
    );

    if (locations.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Location not found",
      });
    }

    const location = {
      ...locations[0],
      is_storage_location: Boolean(locations[0].is_storage_location),
      is_active: Boolean(locations[0].is_active),
    };

    res.json({
      success: true,
      data: location,
    });
  } catch (error) {
    console.error("Get location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch location",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Create Location
 * POST /api/locations
 * Access: Admin only
 */
exports.createLocation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name, building, floor, description, is_storage } = req.body;

    // Check for duplicate name
    const duplicate = await db.query(
      "SELECT id FROM locations WHERE name = ?",
      [name]
    );

    if (duplicate.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Location name already exists",
      });
    }

    const result = await db.query(
      `INSERT INTO locations (name, building, floor, description, is_storage) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        name,
        building || null,
        floor || null,
        description || null,
        is_storage || false,
      ]
    );

    const newLocation = await db.query(
      "SELECT *, is_storage as is_storage_location FROM locations WHERE id = ?",
      [result.insertId]
    );

    const formattedLocation = {
      ...newLocation[0],
      is_storage_location: Boolean(newLocation[0].is_storage_location),
      is_active: Boolean(newLocation[0].is_active),
    };

    res.status(201).json({
      success: true,
      message: "Location created successfully",
      data: formattedLocation,
    });
  } catch (error) {
    console.error("Create location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create location",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Update Location
 * PUT /api/locations/:id
 * Access: Admin only
 */
exports.updateLocation = async (req, res) => {
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
      name,
      building,
      floor,
      description,
      is_storage_location,
      is_storage,
      is_active,
    } = req.body;

    // Support both field names
    const storageValue =
      is_storage_location !== undefined ? is_storage_location : is_storage;

    // Check if location exists
    const existing = await db.query("SELECT * FROM locations WHERE id = ?", [
      id,
    ]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Location not found",
      });
    }

    // Check for duplicate name (excluding current location)
    const duplicate = await db.query(
      "SELECT id FROM locations WHERE name = ? AND id != ?",
      [name, id]
    );

    if (duplicate.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Location name already exists",
      });
    }

    await db.query(
      `UPDATE locations 
       SET name = ?, building = ?, floor = ?, description = ?, 
           is_storage = ?, is_active = ?
       WHERE id = ?`,
      [
        name,
        building || null,
        floor || null,
        description || null,
        storageValue || false,
        is_active !== false,
        id,
      ]
    );

    const updated = await db.query(
      "SELECT *, is_storage as is_storage_location FROM locations WHERE id = ?",
      [id]
    );

    const formattedLocation = {
      ...updated[0],
      is_storage_location: Boolean(updated[0].is_storage_location),
      is_active: Boolean(updated[0].is_active),
    };

    res.json({
      success: true,
      message: "Location updated successfully",
      data: formattedLocation,
    });
  } catch (error) {
    console.error("Update location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update location",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Delete Location
 * DELETE /api/locations/:id
 * Access: Admin only
 */
exports.deleteLocation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    // Check if location exists
    const existing = await db.query("SELECT * FROM locations WHERE id = ?", [
      id,
    ]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Location not found",
      });
    }

    // Check if location is in use
    const lostItems = await db.query(
      "SELECT COUNT(*) as count FROM lost_items WHERE last_seen_location_id = ?",
      [id]
    );
    const foundItems = await db.query(
      "SELECT COUNT(*) as count FROM found_items WHERE found_location_id = ? OR storage_location_id = ?",
      [id, id]
    );

    if (lostItems[0].count > 0 || foundItems[0].count > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete location that is in use. Deactivate it instead.",
      });
    }

    await db.query("DELETE FROM locations WHERE id = ?", [id]);

    res.json({
      success: true,
      message: "Location deleted successfully",
    });
  } catch (error) {
    console.error("Delete location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete location",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Toggle Location Status
 * PATCH /api/locations/:id/toggle
 * Access: Admin only
 */
exports.toggleLocationStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    const locations = await db.query("SELECT * FROM locations WHERE id = ?", [
      id,
    ]);

    if (locations.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Location not found",
      });
    }

    const newStatus = !locations[0].is_active;

    await db.query("UPDATE locations SET is_active = ? WHERE id = ?", [
      newStatus,
      id,
    ]);

    const updated = await db.query(
      "SELECT *, is_storage as is_storage_location FROM locations WHERE id = ?",
      [id]
    );

    const formattedLocation = {
      ...updated[0],
      is_storage_location: Boolean(updated[0].is_storage_location),
      is_active: Boolean(updated[0].is_active),
    };

    res.json({
      success: true,
      message: `Location ${
        newStatus ? "activated" : "deactivated"
      } successfully`,
      data: formattedLocation,
    });
  } catch (error) {
    console.error("Toggle location status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle location status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
