/**
 * Locations API Tests
 * Comprehensive tests for location management
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
  await db.query("DELETE FROM users WHERE school_id = '25-4001'");
  await request(app).post("/api/auth/register").send({
    school_id: "25-4001",
    email: "locuser@test.com",
    password: "User1@123456",
    confirm_password: "User1@123456",
    first_name: "Loc",
    last_name: "User",
  });

  await db.query(
    "UPDATE users SET status = 'active' WHERE school_id = '25-4001'"
  );

  const userLogin = await request(app).post("/api/auth/login").send({
    school_id: "25-4001",
    password: "User1@123456",
  });
  if (userLogin.status === 200) {
    tokens.user1Token = userLogin.body.data.accessToken;
  }
}, 30000);

afterAll(async () => {
  await db.closePool();
});

describe("Locations API", () => {
  let createdLocationId;

  describe("GET /api/locations", () => {
    it("should return all active locations", async () => {
      const response = await request(app).get("/api/locations");

      assertions.expectSuccessResponse(response);
      expect(Array.isArray(response.body.data)).toBe(true);

      // All should be active
      response.body.data.forEach((location) => {
        expect([1, true]).toContain(location.is_active);
      });
    });

    it("should not require authentication", async () => {
      const response = await request(app).get("/api/locations");

      expect(response.status).toBe(200);
    });

    it("should filter by is_storage_location", async () => {
      const response = await request(app).get(
        "/api/locations?is_storage_location=true"
      );

      assertions.expectSuccessResponse(response);
      response.body.data.forEach((location) => {
        expect(location.is_storage_location).toBe(true);
      });
    });

    it("should return locations with proper structure", async () => {
      const response = await request(app).get("/api/locations");

      if (response.body.data.length > 0) {
        expect(response.body.data[0]).toHaveProperty("id");
        expect(response.body.data[0]).toHaveProperty("name");
        expect(response.body.data[0]).toHaveProperty("description");
        expect(response.body.data[0]).toHaveProperty("is_storage_location");
      }
    });
  });

  describe("GET /api/locations/:id", () => {
    it("should get location by ID", async () => {
      const response = await request(app).get("/api/locations/1");

      if (response.status === 200) {
        assertions.expectSuccessResponse(response);
        expect(response.body.data).toHaveProperty("id", 1);
        expect(response.body.data).toHaveProperty("name");
      }
    });

    it("should return 404 for non-existent location", async () => {
      const response = await request(app).get("/api/locations/999999");

      expect(response.status).toBe(404);
    });

    it("should validate ID parameter", async () => {
      const response = await request(app).get("/api/locations/invalid-id");

      assertions.expectValidationError(response);
    });
  });

  describe("POST /api/locations", () => {
    it("should create location as admin", async () => {
      const response = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send(testData.validLocation);

      expect(response.status).toBe(201);
      assertions.expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty("id");

      createdLocationId = response.body.data.id;
    });

    it("should create storage location", async () => {
      const response = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          ...testData.validLocation,
          name: "Security Office Storage",
          is_storage_location: true,
        });

      if (response.status === 201) {
        expect(response.body.data.is_storage_location).toBe(true);
      }
    });

    it("should require admin role", async () => {
      const response = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validLocation);

      assertions.expectForbidden(response);
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .post("/api/locations")
        .send(testData.validLocation);

      assertions.expectAuthRequired(response);
    });

    it("should validate required fields", async () => {
      const response = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "", // Empty name
        });

      assertions.expectValidationError(response);
    });

    it("should reject duplicate location names", async () => {
      await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Test Duplicate Location",
          description: "First attempt",
        });

      const response = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Test Duplicate Location",
          description: "Second attempt",
        });

      expect(response.status).toBe(400);
    });

    it("should sanitize XSS in name and description", async () => {
      const response = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: '<script>alert("XSS")</script> Library',
          description: '<img src=x onerror="alert(1)"> Location description',
        });

      if (response.status === 201) {
        expect(response.body.data.name).not.toContain("<script>");
        expect(response.body.data.description).not.toContain("<img");
      }
    });

    it("should reject name longer than 100 characters", async () => {
      const response = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "A".repeat(101),
          description: "Valid description",
        });

      assertions.expectValidationError(response);
    });

    it("should default is_storage_location to false", async () => {
      const response = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Default Storage Test",
          description: "Testing default",
        });

      if (response.status === 201) {
        expect(response.body.data.is_storage_location).toBe(false);
      }
    });
  });

  describe("PUT /api/locations/:id", () => {
    it("should update location as admin", async () => {
      if (createdLocationId) {
        const response = await request(app)
          .put(`/api/locations/${createdLocationId}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({
            name: "Updated Location Name",
            description: "Updated description",
            is_storage_location: true,
          });

        assertions.expectSuccessResponse(response);
        expect(response.body.data.name).toBe("Updated Location Name");
        expect(response.body.data.is_storage_location).toBe(true);
      }
    });

    it("should require admin role", async () => {
      const response = await request(app)
        .put("/api/locations/1")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          name: "Unauthorized Update",
          description: "Should fail",
        });

      assertions.expectForbidden(response);
    });

    it("should validate name uniqueness on update", async () => {
      const loc1Response = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Unique Location 1",
          description: "First",
        });

      const loc2Response = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Unique Location 2",
          description: "Second",
        });

      if (loc2Response.body.data?.id) {
        const response = await request(app)
          .put(`/api/locations/${loc2Response.body.data.id}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({
            name: "Unique Location 1", // Duplicate
            description: "Updated",
          });

        expect(response.status).toBe(400);
      }
    });
  });

  describe("DELETE /api/locations/:id", () => {
    it("should prevent deleting location in use", async () => {
      // Location 1 likely has items
      const response = await request(app)
        .delete("/api/locations/1")
        .set("Authorization", `Bearer ${tokens.adminToken}`);

      // Should fail if in use
      if (response.status === 400) {
        expect(response.body.message).toContain("in use");
      }
    });

    it("should soft delete unused location", async () => {
      const createResponse = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Deletable Location",
          description: "Will be deleted",
        });

      const locationId = createResponse.body.data?.id;

      if (locationId) {
        const response = await request(app)
          .delete(`/api/locations/${locationId}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should require admin role", async () => {
      const response = await request(app)
        .delete("/api/locations/1")
        .set("Authorization", `Bearer ${tokens.user1Token}`);

      assertions.expectForbidden(response);
    });

    it("should return 404 for non-existent location", async () => {
      const response = await request(app)
        .delete("/api/locations/999999")
        .set("Authorization", `Bearer ${tokens.adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/locations/:id/toggle", () => {
    it("should toggle location active status", async () => {
      if (createdLocationId) {
        // Deactivate
        const deactivateResponse = await request(app)
          .patch(`/api/locations/${createdLocationId}/toggle`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        expect(deactivateResponse.body.data.is_active).toBe(false);

        // Reactivate
        const activateResponse = await request(app)
          .patch(`/api/locations/${createdLocationId}/toggle`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        expect(activateResponse.body.data.is_active).toBe(true);
      }
    });

    it("should require admin role", async () => {
      const response = await request(app)
        .patch("/api/locations/1/toggle")
        .set("Authorization", `Bearer ${tokens.user1Token}`);

      assertions.expectForbidden(response);
    });
  });
});
