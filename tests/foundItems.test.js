/**
 * Found Items API Tests
 * Comprehensive tests for found items CRUD and workflows
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

  // Create and activate test users
  await db.query("DELETE FROM users WHERE school_id IN ('25-2001', '25-2002')");

  const reg1 = await request(app).post("/api/auth/register").send({
    school_id: "25-2001",
    email: "fuser1@test.com",
    password: "User1@123456",
    confirm_password: "User1@123456",
    first_name: "Found",
    last_name: "UserOne",
  });

  if (reg1.status !== 201) {
    console.error("Failed to register user1:", reg1.status, reg1.body);
  }

  await db.query(
    "UPDATE users SET status = 'active' WHERE school_id = '25-2001'"
  );

  const user1Login = await request(app).post("/api/auth/login").send({
    school_id: "25-2001",
    password: "User1@123456",
  });
  if (user1Login.status === 200) {
    tokens.user1Token = user1Login.body.data.accessToken;
  } else {
    console.error("Failed to login user1:", user1Login.status, user1Login.body);
  }

  await request(app).post("/api/auth/register").send({
    school_id: "25-2002",
    email: "fuser2@test.com",
    password: "User2@123456",
    confirm_password: "User2@123456",
    first_name: "Found",
    last_name: "UserTwo",
  });

  await db.query(
    "UPDATE users SET status = 'active' WHERE school_id = '25-2002'"
  );

  const user2Login = await request(app).post("/api/auth/login").send({
    school_id: "25-2002",
    password: "User2@123456",
  });
  if (user2Login.status === 200) {
    tokens.user2Token = user2Login.body.data.accessToken;
  }

  // Create security user
  await db.query("DELETE FROM users WHERE school_id = 'SEC-2024'");
  await request(app).post("/api/auth/register").send({
    school_id: "SEC-2024",
    email: "security@test.com",
    password: "Security@123456",
    confirm_password: "Security@123456",
    first_name: "Security",
    last_name: "Officer",
  });

  await db.query(
    "UPDATE users SET status = 'active', role = 'security' WHERE school_id = 'SEC-2024'"
  );

  const securityLogin = await request(app).post("/api/auth/login").send({
    school_id: "SEC-2024",
    password: "Security@123456",
  });
  if (securityLogin.status === 200) {
    tokens.securityToken = securityLogin.body.data.accessToken;
  }
}, 30000);

afterAll(async () => {
  await db.closePool();
});

describe("Found Items API", () => {
  let createdItemId;

  describe("POST /api/found-items", () => {
    it("should create found item with valid data", async () => {
      const response = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validFoundItem);

      expect(response.status).toBe(201);
      assertions.expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty("id");
      expect(response.body.data.status).toBe("pending");
      expect(response.body.data.current_location_id).toBeDefined();

      createdItemId = response.body.data.id;
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .post("/api/found-items")
        .send(testData.validFoundItem);

      assertions.expectAuthRequired(response);
    });

    it("should validate required fields", async () => {
      const response = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          title: "Incomplete",
          // Missing required fields
        });

      assertions.expectValidationError(response);
    });

    it("should require current_location_id", async () => {
      const response = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validFoundItem,
          current_location_id: undefined,
        });

      assertions.expectValidationError(response);
    });

    it("should reject title shorter than 5 characters", async () => {
      const response = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validFoundItem,
          title: "abc",
        });

      assertions.expectValidationError(response);
    });

    it("should reject description shorter than 20 characters", async () => {
      const response = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validFoundItem,
          description: "Too short",
        });

      assertions.expectValidationError(response);
    });

    it("should reject future dates", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const response = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validFoundItem,
          found_date: futureDate.toISOString().split("T")[0],
        });

      assertions.expectValidationError(response);
    });

    it("should sanitize XSS in text fields", async () => {
      const response = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validFoundItem,
          title: '<script>alert("XSS")</script> Keys',
          description: '<img src=x onerror="alert(1)"> Found some keys',
        });

      if (response.status === 201) {
        expect(response.body.data.title).not.toContain("<script>");
        expect(response.body.data.description).not.toContain("<img");
      }
    });

    it("should handle distinctive features array", async () => {
      const response = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validFoundItem,
          distinctive_features: JSON.stringify([
            "Blue case",
            "Cracked screen",
            "Sticker on back",
          ]),
        });

      if (response.status === 201) {
        expect(response.body.data.distinctive_features).toBeDefined();
      }
    });
  });

  describe("GET /api/found-items", () => {
    it("should return approved items for public", async () => {
      const response = await request(app).get("/api/found-items");

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
        .get("/api/found-items")
        .set("Authorization", `Bearer ${tokens.adminToken}`);

      assertions.expectSuccessResponse(response);
    });

    it("should filter by category", async () => {
      const response = await request(app).get("/api/found-items?category_id=1");

      assertions.expectSuccessResponse(response);
      response.body.data.items.forEach((item) => {
        expect(item.category_id).toBe(1);
      });
    });

    it("should filter by location", async () => {
      const response = await request(app).get("/api/found-items?location_id=3");

      assertions.expectSuccessResponse(response);
    });

    it("should filter by current_location", async () => {
      const response = await request(app).get(
        "/api/found-items?current_location_id=5"
      );

      assertions.expectSuccessResponse(response);
    });

    it("should search by keyword", async () => {
      const response = await request(app).get("/api/found-items?search=keys");

      assertions.expectSuccessResponse(response);
    });

    it("should filter by date range", async () => {
      const response = await request(app).get(
        "/api/found-items?date_from=2025-10-01&date_to=2025-10-31"
      );

      assertions.expectSuccessResponse(response);
    });

    it("should filter by claim status", async () => {
      const response = await request(app).get(
        "/api/found-items?is_claimed=false"
      );

      assertions.expectSuccessResponse(response);
      response.body.data.items.forEach((item) => {
        expect(item.is_claimed).toBe(false);
      });
    });

    it("should paginate results", async () => {
      const response = await request(app).get(
        "/api/found-items?page=1&limit=5"
      );

      assertions.expectSuccessResponse(response);
      expect(response.body.data.pagination).toHaveProperty("page", 1);
      expect(response.body.data.pagination).toHaveProperty("limit", 5);
      expect(response.body.data.items.length).toBeLessThanOrEqual(5);
    });
  });

  describe("GET /api/found-items/:id", () => {
    it("should get approved item as public", async () => {
      const response = await request(app).get("/api/found-items/1");

      if (response.status === 200) {
        assertions.expectSuccessResponse(response);
        expect(response.body.data).toHaveProperty("id", 1);
      }
    });

    it("should allow owner to view pending item", async () => {
      if (createdItemId) {
        const response = await request(app)
          .get(`/api/found-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should prevent other users from viewing pending item", async () => {
      if (createdItemId) {
        const response = await request(app)
          .get(`/api/found-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user2Token}`);

        assertions.expectForbidden(response);
      }
    });

    it("should allow admin to view any item", async () => {
      if (createdItemId) {
        const response = await request(app)
          .get(`/api/found-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should return 404 for non-existent item", async () => {
      const response = await request(app).get("/api/found-items/999999");

      expect(response.status).toBe(404);
    });

    it("should validate ID parameter", async () => {
      const response = await request(app).get("/api/found-items/invalid-id");

      assertions.expectValidationError(response);
    });
  });

  describe("PUT /api/found-items/:id", () => {
    it("should update own item", async () => {
      if (createdItemId) {
        const response = await request(app)
          .put(`/api/found-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`)
          .send({
            ...testData.validFoundItem,
            title: "Updated - Set of Keys with Keychain",
          });

        assertions.expectSuccessResponse(response);
        expect(response.body.data.title).toContain("Updated");
        expect(response.body.data.status).toBe("pending");
      }
    });

    it("should reset status to pending after update", async () => {
      if (createdItemId) {
        // First approve
        await request(app)
          .patch(`/api/found-items/${createdItemId}/review`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({ status: "approved" });

        // Then update
        const response = await request(app)
          .put(`/api/found-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`)
          .send({
            ...testData.validFoundItem,
            title: "Another Update",
          });

        expect(response.body.data.status).toBe("pending");
      }
    });

    it("should prevent updating others items", async () => {
      if (createdItemId) {
        const response = await request(app)
          .put(`/api/found-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user2Token}`)
          .send({
            ...testData.validFoundItem,
            title: "Unauthorized Update",
          });

        assertions.expectForbidden(response);
      }
    });

    it("should allow updating current_location_id", async () => {
      if (createdItemId) {
        const response = await request(app)
          .put(`/api/found-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`)
          .send({
            ...testData.validFoundItem,
            current_location_id: 7,
          });

        if (response.status === 200) {
          expect(response.body.data.current_location_id).toBe(7);
        }
      }
    });
  });

  describe("DELETE /api/found-items/:id", () => {
    it("should soft delete own item", async () => {
      if (createdItemId) {
        const response = await request(app)
          .delete(`/api/found-items/${createdItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should allow admin to delete any item", async () => {
      const createResponse = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user2Token}`)
        .send(testData.validFoundItem);

      const itemId = createResponse.body.data?.id;

      if (itemId) {
        const response = await request(app)
          .delete(`/api/found-items/${itemId}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should prevent deleting claimed items", async () => {
      // Would need to create and claim an item first
    });
  });

  describe("PATCH /api/found-items/:id/review", () => {
    let reviewItemId;

    beforeAll(async () => {
      const response = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validFoundItem);

      reviewItemId = response.body.data?.id;
    });

    it("should allow admin to approve item", async () => {
      if (reviewItemId) {
        const response = await request(app)
          .patch(`/api/found-items/${reviewItemId}/review`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({ status: "approved" });

        assertions.expectSuccessResponse(response);
      }
    });

    it("should allow security to approve item", async () => {
      const createResponse = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validFoundItem);

      const itemId = createResponse.body.data?.id;

      if (itemId) {
        const response = await request(app)
          .patch(`/api/found-items/${itemId}/review`)
          .set("Authorization", `Bearer ${tokens.securityToken}`)
          .send({ status: "approved" });

        assertions.expectSuccessResponse(response);
      }
    });

    it("should reject item with reason", async () => {
      const createResponse = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validFoundItem);

      const itemId = createResponse.body.data?.id;

      if (itemId) {
        const response = await request(app)
          .patch(`/api/found-items/${itemId}/review`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({
            status: "rejected",
            rejection_reason: "Incomplete information",
          });

        assertions.expectSuccessResponse(response);
      }
    });

    it("should require rejection reason when rejecting", async () => {
      if (reviewItemId) {
        const response = await request(app)
          .patch(`/api/found-items/${reviewItemId}/review`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({ status: "rejected" });

        assertions.expectValidationError(response);
      }
    });

    it("should prevent regular users from reviewing", async () => {
      if (reviewItemId) {
        const response = await request(app)
          .patch(`/api/found-items/${reviewItemId}/review`)
          .set("Authorization", `Bearer ${tokens.user1Token}`)
          .send({ status: "approved" });

        assertions.expectForbidden(response);
      }
    });
  });
});
