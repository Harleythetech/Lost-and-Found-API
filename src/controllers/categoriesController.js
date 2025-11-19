/**
 * Categories Controller
 * Manages item categories (Electronics, Books, IDs, etc.)
 */

const db = require("../config/database");
const { validationResult } = require("express-validator");

/**
 * Get All Categories
 * GET /api/categories
 * Access: Public
 */
exports.getCategories = async (req, res) => {
  try {
    const { active_only = "true" } = req.query;

    let query = "SELECT * FROM categories";
    let params = [];

    if (active_only === "true") {
      query += " WHERE is_active = TRUE";
    }

    query += " ORDER BY name ASC";

    const categories = await db.query(query, params);

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get Single Category
 * GET /api/categories/:id
 * Access: Public
 */
exports.getCategoryById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    const categories = await db.query("SELECT * FROM categories WHERE id = ?", [
      id,
    ]);

    if (categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.json({
      success: true,
      data: categories[0],
    });
  } catch (error) {
    console.error("Get category error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch category",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Create Category
 * POST /api/categories
 * Access: Admin only
 */
exports.createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name, description, icon } = req.body;

    const result = await db.query(
      "INSERT INTO categories (name, description, icon) VALUES (?, ?, ?)",
      [name, description || null, icon || null]
    );

    const newCategory = await db.query(
      "SELECT * FROM categories WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: newCategory[0],
    });
  } catch (error) {
    console.error("Create category error:", error);

    // Handle duplicate category name
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Category with this name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create category",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Update Category
 * PUT /api/categories/:id
 * Access: Admin only
 */
exports.updateCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const { name, description, icon, is_active } = req.body;

    // Check if category exists
    const existing = await db.query("SELECT * FROM categories WHERE id = ?", [
      id,
    ]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    await db.query(
      `UPDATE categories 
       SET name = ?, description = ?, icon = ?, is_active = ?
       WHERE id = ?`,
      [name, description || null, icon || null, is_active !== false, id]
    );

    const updated = await db.query("SELECT * FROM categories WHERE id = ?", [
      id,
    ]);

    const formattedCategory = {
      ...updated[0],
      is_active: Boolean(updated[0].is_active),
    };

    res.json({
      success: true,
      message: "Category updated successfully",
      data: formattedCategory,
    });
  } catch (error) {
    console.error("Update category error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Category with this name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update category",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Delete Category
 * DELETE /api/categories/:id
 * Access: Admin only
 */
exports.deleteCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    // Check if category exists
    const existing = await db.query("SELECT * FROM categories WHERE id = ?", [
      id,
    ]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if category is in use
    const lostItems = await db.query(
      "SELECT COUNT(*) as count FROM lost_items WHERE category_id = ?",
      [id]
    );
    const foundItems = await db.query(
      "SELECT COUNT(*) as count FROM found_items WHERE category_id = ?",
      [id]
    );

    if (lostItems[0].count > 0 || foundItems[0].count > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete category that is in use. Deactivate it instead.",
      });
    }

    await db.query("DELETE FROM categories WHERE id = ?", [id]);

    res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Delete category error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete category",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Toggle Category Status
 * PATCH /api/categories/:id/toggle
 * Access: Admin only
 */
exports.toggleCategoryStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    const categories = await db.query("SELECT * FROM categories WHERE id = ?", [
      id,
    ]);

    if (categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const newStatus = !categories[0].is_active;

    await db.query("UPDATE categories SET is_active = ? WHERE id = ?", [
      newStatus,
      id,
    ]);

    const updated = await db.query("SELECT * FROM categories WHERE id = ?", [
      id,
    ]);

    const formattedCategory = {
      ...updated[0],
      is_active: Boolean(updated[0].is_active),
    };

    res.json({
      success: true,
      message: `Category ${
        newStatus ? "activated" : "deactivated"
      } successfully`,
      data: formattedCategory,
    });
  } catch (error) {
    console.error("Toggle category status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle category status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
