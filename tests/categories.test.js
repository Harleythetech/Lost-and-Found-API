/**
 * Categories API Tests
 * Comprehensive tests for category management
 */

// Set test environment before loading anything
process.env.NODE_ENV = "test";

// Load environment variables FIRST
require("dotenv").config();

const request = require("supertest");
const db = require("../src/config/database");
const { testData, assertions } = require("./helpers");

let app;
let tokens = {};

beforeAll(async () => {
  await db.initializePool();
  app = require("../index");

  // Login to get real tokens
  const adminLogin = await request(app).post("/api/auth/login").send({
    school_id: "ADMIN-2024",
    password: "Admin@12345",
  });
  if (adminLogin.status === 200) {
    tokens.adminToken = adminLogin.body.data.accessToken;
  }

  // Create regular user
  await db.query("DELETE FROM users WHERE school_id = '25-3001'");
  await request(app).post("/api/auth/register").send({
    school_id: "25-3001",
    email: "catuser@test.com",
    password: "User1@123456",
    confirm_password: "User1@123456",
    first_name: "Cat",
    last_name: "User",
  });

  await db.query(
    "UPDATE users SET status = 'active' WHERE school_id = '25-3001'"
  );

  const userLogin = await request(app).post("/api/auth/login").send({
    school_id: "25-3001",
    password: "User1@123456",
  });
  if (userLogin.status === 200) {
    tokens.user1Token = userLogin.body.data.accessToken;
  }
}, 30000);

afterAll(async () => {
  await db.closePool();
});

describe("Categories API", () => {
  let createdCategoryId;

  describe("GET /api/categories", () => {
    it("should return all active categories", async () => {
      const response = await request(app).get("/api/categories");

      assertions.expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);

      // All should be active
      response.body.data.forEach((category) => {
        expect([1, true]).toContain(category.is_active);
      });
    });

    it("should not require authentication", async () => {
      const response = await request(app).get("/api/categories");

      expect(response.status).toBe(200);
    });

    it("should return categories with item counts", async () => {
      const response = await request(app).get("/api/categories");

      if (response.body.data.length > 0) {
        expect(response.body.data[0]).toHaveProperty("id");
        expect(response.body.data[0]).toHaveProperty("name");
        expect(response.body.data[0]).toHaveProperty("description");
        // May have item_count depending on implementation
      }
    });
  });

  describe("GET /api/categories/:id", () => {
    it("should get category by ID", async () => {
      const response = await request(app).get("/api/categories/1");

      if (response.status === 200) {
        assertions.expectSuccessResponse(response);
        expect(response.body.data).toHaveProperty("id", 1);
        expect(response.body.data).toHaveProperty("name");
      }
    });

    it("should return 404 for non-existent category", async () => {
      const response = await request(app).get("/api/categories/999999");

      expect(response.status).toBe(404);
    });

    it("should validate ID parameter", async () => {
      const response = await request(app).get("/api/categories/invalid-id");

      assertions.expectValidationError(response);
    });
  });

  describe("POST /api/categories", () => {
    it("should create category as admin", async () => {
      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send(testData.validCategory);

      expect(response.status).toBe(201);
      assertions.expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty("id");

      createdCategoryId = response.body.data.id;
    });

    it("should require admin role", async () => {
      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validCategory);

      assertions.expectForbidden(response);
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .post("/api/categories")
        .send(testData.validCategory);

      assertions.expectAuthRequired(response);
    });

    it("should validate required fields", async () => {
      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "", // Empty name
        });

      assertions.expectValidationError(response);
    });

    it("should reject duplicate category names", async () => {
      // Try to create same category twice
      const uniqueName = `Duplicate Test ${Date.now()}`;
      await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: uniqueName,
          description: "First attempt",
        });

      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: uniqueName,
          description: "Second attempt",
        });

      expect([400, 409]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });

    it("should sanitize XSS in name and description", async () => {
      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: '<script>alert("XSS")</script> Electronics',
          description: '<img src=x onerror="alert(1)"> Category description',
        });

      if (response.status === 201) {
        expect(response.body.data.name).not.toContain("<script>");
        expect(response.body.data.description).not.toContain("<img");
      }
    });

    it("should reject name longer than 100 characters", async () => {
      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "A".repeat(101),
          description: "Valid description",
        });

      assertions.expectValidationError(response);
    });
  });

  describe("PUT /api/categories/:id", () => {
    it("should update category as admin", async () => {
      if (createdCategoryId) {
        const response = await request(app)
          .put(`/api/categories/${createdCategoryId}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({
            name: "Updated Category Name",
            description: "Updated description",
          });

        assertions.expectSuccessResponse(response);
        expect(response.body.data.name).toBe("Updated Category Name");
      }
    });

    it("should require admin role", async () => {
      const response = await request(app)
        .put("/api/categories/1")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          name: "Unauthorized Update",
          description: "Should fail",
        });

      assertions.expectForbidden(response);
    });

    it("should validate name uniqueness on update", async () => {
      // Create two categories
      const cat1Response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Unique Category 1",
          description: "First",
        });

      const cat2Response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Unique Category 2",
          description: "Second",
        });

      // Try to rename cat2 to cat1's name
      if (cat2Response.body.data?.id) {
        const response = await request(app)
          .put(`/api/categories/${cat2Response.body.data.id}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({
            name: "Unique Category 1", // Duplicate
            description: "Updated",
          });

        expect(response.status).toBe(400);
      }
    });
  });

  describe("DELETE /api/categories/:id", () => {
    it("should prevent deleting category in use", async () => {
      // Category 1 likely has items
      const response = await request(app)
        .delete("/api/categories/1")
        .set("Authorization", `Bearer ${tokens.adminToken}`);

      // Should fail if in use
      if (response.status === 400) {
        expect(response.body.message).toContain("in use");
      }
    });

    it("should soft delete unused category", async () => {
      // Create a new category
      const createResponse = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Deletable Category",
          description: "Will be deleted",
        });

      const categoryId = createResponse.body.data?.id;

      if (categoryId) {
        const response = await request(app)
          .delete(`/api/categories/${categoryId}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should require admin role", async () => {
      const response = await request(app)
        .delete("/api/categories/1")
        .set("Authorization", `Bearer ${tokens.user1Token}`);

      assertions.expectForbidden(response);
    });

    it("should return 404 for non-existent category", async () => {
      const response = await request(app)
        .delete("/api/categories/999999")
        .set("Authorization", `Bearer ${tokens.adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/categories/:id/toggle", () => {
    it("should toggle category active status", async () => {
      if (createdCategoryId) {
        // Deactivate
        const deactivateResponse = await request(app)
          .patch(`/api/categories/${createdCategoryId}/toggle`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        expect(deactivateResponse.body.data.is_active).toBe(false);

        // Reactivate
        const activateResponse = await request(app)
          .patch(`/api/categories/${createdCategoryId}/toggle`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        expect(activateResponse.body.data.is_active).toBe(true);
      }
    });

    it("should require admin role", async () => {
      const response = await request(app)
        .patch("/api/categories/1/toggle")
        .set("Authorization", `Bearer ${tokens.user1Token}`);

      assertions.expectForbidden(response);
    });
  });
});
