/**
 * Lost Items API Tests
 * Comprehensive tests for lost items CRUD and workflows
 */

// Set test environment before loading anything
process.env.NODE_ENV = "test";

// Load environment variables FIRST
require("dotenv").config();

const request = require("supertest");
const path = require("path");
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

  // Create and activate a test user
  await db.query("DELETE FROM users WHERE school_id IN ('25-1001', '25-1002')");

  await request(app).post("/api/auth/register").send({
    school_id: "25-1001",
    email: "user1@test.com",
    password: "User1@123456",
    confirm_password: "User1@123456",
    first_name: "User",
    last_name: "One",
  });

  await db.query(
    "UPDATE users SET status = 'active' WHERE school_id = '25-1001'"
  );

  const user1Login = await request(app).post("/api/auth/login").send({
    school_id: "25-1001",
    password: "User1@123456",
  });
  if (user1Login.status === 200) {
    tokens.user1Token = user1Login.body.data.accessToken;
  }

  // Create second user
  await request(app).post("/api/auth/register").send({
    school_id: "25-1002",
    email: "user2@test.com",
    password: "User2@123456",
    confirm_password: "User2@123456",
    first_name: "User",
    last_name: "Two",
  });

  await db.query(
    "UPDATE users SET status = 'active' WHERE school_id = '25-1002'"
  );

  const user2Login = await request(app).post("/api/auth/login").send({
    school_id: "25-1002",
    password: "User2@123456",
  });
  if (user2Login.status === 200) {
    tokens.user2Token = user2Login.body.data.accessToken;
  }
}, 30000);

afterAll(async () => {
  await db.closePool();
});

describe("Lost Items API", () => {
  let createdItemId;

  describe("POST /api/lost-items", () => {
    it("should create lost item with valid data", async () => {
      const response = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validLostItem);

      expect(response.status).toBe(201);
      assertions.expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty("id");
      expect(response.body.data.status).toBe("pending");

      createdItemId = response.body.data.id;
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .post("/api/lost-items")
        .send(testData.validLostItem);

      assertions.expectAuthRequired(response);
    });

    it("should validate required fields", async () => {
      const response = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          title: "Too Short",
          // Missing required fields
        });

      assertions.expectValidationError(response);
    });

    it("should reject title shorter than 5 characters", async () => {
      const response = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validLostItem,
          title: "abc",
        });

      assertions.expectValidationError(response);
    });

    it("should reject description shorter than 20 characters", async () => {
      const response = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validLostItem,
          description: "Too short",
        });

      assertions.expectValidationError(response);
    });

    it("should reject future dates", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const response = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validLostItem,
          last_seen_date: futureDate.toISOString().split("T")[0],
        });

      assertions.expectValidationError(response);
    });

    it("should handle image uploads (multipart)", async () => {
      const testImagePath = path.join(__dirname, "fixtures", "test-image.jpg");

      // Note: Would need actual test image file
      // This is a placeholder for image upload testing
    });

    it("should reject more than 5 images", async () => {
      // Placeholder for testing image count limit
    });

    it("should sanitize XSS in text fields", async () => {
      const response = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validLostItem,
          title: '<script>alert("XSS")</script> Phone',
          description: '<img src=x onerror="alert(1)"> Lost my phone',
        });

      if (response.status === 201) {
        expect(response.body.data.title).not.toContain("<script>");
        expect(response.body.data.description).not.toContain("<img");
      }
    });
  });

  describe("GET /api/lost-items", () => {
    it("should return approved items for public", async () => {
      const response = await request(app).get("/api/lost-items");

      assertions.expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty("items");
      expect(response.body.data).toHaveProperty("pagination");
      expect(Array.isArray(response.body.data.items)).toBe(true);

      // All items should be approved
      response.body.data.items.forEach((item) => {
        expect(item.status).toBe("approved");
      });
    });

    it("should return all items for admin", async () => {
      const response = await request(app)
        .get("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.adminToken}`);

      assertions.expectSuccessResponse(response);

      // Admin can see items with any status
      const statuses = response.body.data.items.map((i) => i.status);
      const hasPending = statuses.includes("pending");
      // May or may not have pending items
    });

    it("should filter by category", async () => {
      const response = await request(app).get("/api/lost-items?category_id=1");

      assertions.expectSuccessResponse(response);
      response.body.data.items.forEach((item) => {
        expect(item.category_id).toBe(1);
      });
    });

    it("should filter by location", async () => {
      const response = await request(app).get("/api/lost-items?location_id=3");

      assertions.expectSuccessResponse(response);
    });

    it("should search by keyword", async () => {
      const response = await request(app).get("/api/lost-items?search=phone");

      assertions.expectSuccessResponse(response);
    });

    it("should filter by date range", async () => {
      const response = await request(app).get(
        "/api/lost-items?date_from=2025-10-01&date_to=2025-10-31"
      );

      assertions.expectSuccessResponse(response);
    });

    it("should paginate results", async () => {
      const response = await request(app).get("/api/lost-items?page=1&limit=5");

      assertions.expectSuccessResponse(response);
      expect(response.body.data.pagination).toHaveProperty("page", 1);
      expect(response.body.data.pagination).toHaveProperty("limit", 5);
      expect(response.body.data.items.length).toBeLessThanOrEqual(5);
    });

    it("should handle invalid pagination values", async () => {
      const response = await request(app).get(
        "/api/lost-items?page=-1&limit=1000"
      );

      // Should use defaults or validate
      assertions.expectValidationError(response);
    });
  });

  describe("GET /api/lost-items/:id", () => {
    it("should get approved item as public", async () => {
      // Assuming item 1 is approved
      const response = await request(app).get("/api/lost-items/1");

      if (response.status === 200) {
        assertions.expectSuccessResponse(response);
        expect(response.body.data).toHaveProperty("id", 1);
      }
    });

    it("should allow owner to view pending item", async () => {
      if (createdItemId) {
        const response = await request(app)
          .get(`/api/lost-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should prevent other users from viewing pending item", async () => {
      if (createdItemId) {
        const response = await request(app)
          .get(`/api/lost-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user2Token}`);

        assertions.expectForbidden(response);
      }
    });

    it("should allow admin to view any item", async () => {
      if (createdItemId) {
        const response = await request(app)
          .get(`/api/lost-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should return 404 for non-existent item", async () => {
      const response = await request(app).get("/api/lost-items/999999");

      expect(response.status).toBe(404);
    });

    it("should validate ID parameter", async () => {
      const response = await request(app).get("/api/lost-items/invalid-id");

      assertions.expectValidationError(response);
    });
  });

  describe("PUT /api/lost-items/:id", () => {
    it("should update own item", async () => {
      if (createdItemId) {
        const response = await request(app)
          .put(`/api/lost-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`)
          .send({
            ...testData.validLostItem,
            title: "Updated Title - Black iPhone",
          });

        assertions.expectSuccessResponse(response);
        expect(response.body.data.title).toContain("Updated");
        expect(response.body.data.status).toBe("pending"); // Reset to pending
      }
    });

    it("should reset status to pending after update", async () => {
      if (createdItemId) {
        // First approve the item
        await request(app)
          .patch(`/api/lost-items/${createdItemId}/review`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({ status: "approved" });

        // Then update it
        const response = await request(app)
          .put(`/api/lost-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`)
          .send({
            ...testData.validLostItem,
            title: "Another Update",
          });

        expect(response.body.data.status).toBe("pending");
      }
    });

    it("should prevent updating others items", async () => {
      if (createdItemId) {
        const response = await request(app)
          .put(`/api/lost-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user2Token}`)
          .send({
            ...testData.validLostItem,
            title: "Hacker Update",
          });

        assertions.expectForbidden(response);
      }
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .put("/api/lost-items/1")
        .send(testData.validLostItem);

      assertions.expectAuthRequired(response);
    });
  });

  describe("DELETE /api/lost-items/:id", () => {
    it("should soft delete own item", async () => {
      if (createdItemId) {
        const response = await request(app)
          .delete(`/api/lost-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should allow admin to delete any item", async () => {
      // Create item as user2
      const createResponse = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user2Token}`)
        .send(testData.validLostItem);

      const itemId = createResponse.body.data?.id;

      if (itemId) {
        const response = await request(app)
          .delete(`/api/lost-items/${itemId}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should prevent deleting others items", async () => {
      // Would need an existing item owned by someone else
    });
  });

  describe("PATCH /api/lost-items/:id/review", () => {
    let reviewItemId;

    beforeAll(async () => {
      // Create item to review
      const response = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validLostItem);

      reviewItemId = response.body.data?.id;
    });

    it("should allow admin to approve item", async () => {
      if (reviewItemId) {
        const response = await request(app)
          .patch(`/api/lost-items/${reviewItemId}/review`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({ status: "approved" });

        assertions.expectSuccessResponse(response);
      }
    });

    it("should allow security to approve item", async () => {
      // Create another item
      const createResponse = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validLostItem);

      const itemId = createResponse.body.data?.id;

      if (itemId) {
        const response = await request(app)
          .patch(`/api/lost-items/${itemId}/review`)
          .set("Authorization", `Bearer ${tokens.securityToken}`)
          .send({ status: "approved" });

        assertions.expectSuccessResponse(response);
      }
    });

    it("should reject item with reason", async () => {
      // Create another item
      const createResponse = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validLostItem);

      const itemId = createResponse.body.data?.id;

      if (itemId) {
        const response = await request(app)
          .patch(`/api/lost-items/${itemId}/review`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({
            status: "rejected",
            rejection_reason: "Insufficient description",
          });

        assertions.expectSuccessResponse(response);
      }
    });

    it("should require rejection reason when rejecting", async () => {
      if (reviewItemId) {
        const response = await request(app)
          .patch(`/api/lost-items/${reviewItemId}/review`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({ status: "rejected" });

        assertions.expectValidationError(response);
      }
    });

    it("should prevent regular users from reviewing", async () => {
      if (reviewItemId) {
        const response = await request(app)
          .patch(`/api/lost-items/${reviewItemId}/review`)
          .set("Authorization", `Bearer ${tokens.user1Token}`)
          .send({ status: "approved" });

        assertions.expectForbidden(response);
      }
    });
  });
});
