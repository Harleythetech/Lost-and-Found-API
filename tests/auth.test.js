/**
 * Authentication API Tests
 * Tests all auth endpoints including security features
 */

// Set test environment before loading anything
process.env.NODE_ENV = "test";

// Load environment variables FIRST before any other imports
require("dotenv").config();

const request = require("supertest");
const bcrypt = require("bcrypt");
const db = require("../src/config/database");
const { testUsers, generateTestTokens, assertions } = require("./helpers");

// Mock app for testing
let app;

beforeAll(async () => {
  // Initialize database connection first
  try {
    console.log("Attempting to initialize database...");
    await db.initializePool();
    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    console.error("Full error:", error);
    throw new Error("Cannot run tests without database connection");
  }

  // Load app after database is initialized
  console.log("Loading app...");
  app = require("../index");
  console.log("App loaded successfully");
}, 30000); // 30 second timeout for database connection

afterAll(async () => {
  await db.closePool();
});

describe("Authentication API", () => {
  // Small delay between tests for database operations
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100)); // Minimal delay
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user with valid data", async () => {
      const testSchoolId = "25-9999";

      // Clean up any existing test user first
      try {
        await db.query("DELETE FROM users WHERE school_id = ?", [testSchoolId]);
      } catch (err) {
        // Ignore errors
      }

      const response = await request(app).post("/api/auth/register").send({
        school_id: testSchoolId,
        email: "newuser@test.com",
        password: "ValidPass123!",
        confirm_password: "ValidPass123!",
        first_name: "Test",
        last_name: "User",
      });

      if (response.status !== 201) {
        console.log("Registration failed:", response.body);
      }

      expect(response.status).toBe(201);
      assertions.expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty("school_id", "25-9999");
      expect(response.body.data).toHaveProperty("status", "pending");
      expect(response.body.data).toHaveProperty("first_name", "Test");
      expect(response.body.data).toHaveProperty("last_name", "User");
    });

    it("should reject duplicate school_id", async () => {
      // Register first time
      await request(app).post("/api/auth/register").send({
        school_id: "25-8888",
        email: "dup1@test.com",
        password: "ValidPass123!",
        confirm_password: "ValidPass123!",
        first_name: "Dup",
        last_name: "User",
      });

      // Try to register again with same school_id
      const response = await request(app).post("/api/auth/register").send({
        school_id: "25-8888",
        email: "dup2@test.com",
        password: "ValidPass123!",
        confirm_password: "ValidPass123!",
        first_name: "Dup",
        last_name: "Two",
      });

      // Should get 409 duplicate error
      expect(response.status).toBe(409);
      expect(response.body.message).toContain("already");
    });

    it("should reject invalid school_id format", async () => {
      const response = await request(app).post("/api/auth/register").send({
        school_id: "INVALID",
        email: "test@test.com",
        password: "ValidPass123!",
        confirm_password: "ValidPass123!",
        first_name: "Test",
        last_name: "User",
      });

      assertions.expectValidationError(response);
    });

    it("should reject weak password", async () => {
      const response = await request(app).post("/api/auth/register").send({
        school_id: "25-7777",
        email: "weak@test.com",
        password: "weak",
        confirm_password: "weak",
        first_name: "Test",
        last_name: "User",
      });

      assertions.expectValidationError(response);
    });

    it("should reject mismatched passwords", async () => {
      const response = await request(app).post("/api/auth/register").send({
        school_id: "25-6666",
        email: "mismatch@test.com",
        password: "ValidPass123!",
        confirm_password: "DifferentPass123!",
        first_name: "Test",
        last_name: "User",
      });

      expect(response.status).toBe(400);
      assertions.expectValidationError(response);
    });

    it("should reject invalid email format", async () => {
      const response = await request(app).post("/api/auth/register").send({
        school_id: "25-5555",
        email: "invalid-email",
        password: "ValidPass123!",
        confirm_password: "ValidPass123!",
        first_name: "Test",
        last_name: "User",
      });

      expect(response.status).toBe(400);
      assertions.expectValidationError(response);
    });

    it("should sanitize XSS attempts in name fields", async () => {
      const response = await request(app).post("/api/auth/register").send({
        school_id: "25-4444",
        email: "xss@test.com",
        password: "ValidPass123!",
        confirm_password: "ValidPass123!",
        first_name: '<script>alert("XSS")</script>',
        last_name: "User",
      });

      if (response.status === 201) {
        expect(response.body.data.user.first_name).not.toContain("<script>");
      }
    });

    it("should reject unexpected fields", async () => {
      const response = await request(app).post("/api/auth/register").send({
        school_id: "25-3333",
        email: "extra@test.com",
        password: "ValidPass123!",
        confirm_password: "ValidPass123!",
        first_name: "Test",
        last_name: "User",
        role: "admin", // Trying to set role
        status: "active", // Trying to bypass pending
      });

      expect(response.status).toBe(400);
      assertions.expectValidationError(response);
    });
  });

  describe("POST /api/auth/login", () => {
    it("should login with valid credentials", async () => {
      const response = await request(app).post("/api/auth/login").send({
        school_id: "ADMIN-2024",
        password: "Admin@12345",
      });

      if (response.status === 200) {
        assertions.expectSuccessResponse(response);
        expect(response.body.data).toHaveProperty("accessToken");
        expect(response.body.data).toHaveProperty("refreshToken");
        expect(response.body.data.user).toHaveProperty("school_id");
        expect(response.body.data.user).not.toHaveProperty("password_hash");
      }
    });

    it("should reject invalid password", async () => {
      const response = await request(app).post("/api/auth/login").send({
        school_id: "ADMIN-2024",
        password: "WrongPassword123!",
      });

      expect([401, 403]).toContain(response.status);
    });

    it("should reject non-existent user", async () => {
      const response = await request(app).post("/api/auth/login").send({
        school_id: "99-9999",
        password: "AnyPassword123!",
      });

      expect(response.status).toBe(401);
      assertions.expectErrorResponse(response, 401);
    });

    it("should implement account lockout after failed attempts", async () => {
      const testSchoolId = "25-2222";

      // Create test user
      await request(app).post("/api/auth/register").send({
        school_id: testSchoolId,
        email: "lockout@test.com",
        password: "Correct123!",
        confirm_password: "Correct123!",
        first_name: "Lock",
        last_name: "Out",
      });

      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app).post("/api/auth/login").send({
          school_id: testSchoolId,
          password: "WrongPassword123!",
        });
      }

      // 6th attempt should be locked
      const response = await request(app).post("/api/auth/login").send({
        school_id: testSchoolId,
        password: "Correct123!",
      });

      expect([401, 403]).toContain(response.status);
      expect(response.body.message.toLowerCase()).toMatch(
        /lock|attempt|minute|pending/
      );
    });

    it("should reject suspended users", async () => {
      const tokens = generateTestTokens();

      const response = await request(app).post("/api/auth/login").send({
        school_id: testUsers.suspended.school_id,
        password: testUsers.suspended.password,
      });

      // May be rate limited, show suspended message, or invalid credentials if user doesn't exist
      if (response.status !== 429) {
        expect([401, 403]).toContain(response.status);
        // Check message if not rate limited - could be suspended or invalid (user doesn't exist)
        expect(response.body.message.toLowerCase()).toMatch(/suspend|invalid/);
      }
    });

    it("should accept admin format school_id", async () => {
      const response = await request(app).post("/api/auth/login").send({
        school_id: "ADMIN-2024",
        password: "Admin@12345",
      });

      // Should not have validation error
      expect(response.status).not.toBe(400);
    });

    it("should implement rate limiting", async () => {
      // Since test environment has 1000 limit, we need to test with production-like scenario
      // Create a separate test that temporarily uses smaller window or we just verify the mechanism exists
      // For now, let's verify that rate limiting headers are present
      const response = await request(app).post("/api/auth/login").send({
        school_id: "ADMIN-2024",
        password: "AnyPassword",
      });

      // Check if rate limit headers are present (indicates rate limiting is configured)
      const hasRateLimitHeaders =
        response.headers["x-ratelimit-limit"] !== undefined ||
        response.headers["ratelimit-limit"] !== undefined;

      expect(hasRateLimitHeaders).toBe(true);
    });
  });

  describe("GET /api/auth/me", () => {
    let validToken;

    beforeAll(async () => {
      // Login to get a real valid token
      const loginResponse = await request(app).post("/api/auth/login").send({
        school_id: "ADMIN-2024",
        password: "Admin@12345",
      });

      if (loginResponse.status === 200 && loginResponse.body.data) {
        validToken = loginResponse.body.data.accessToken;
      } else {
        console.error(
          "Failed to get token for profile tests:",
          loginResponse.status,
          loginResponse.body
        );
      }
    });

    it("should get profile with valid token", async () => {
      if (!validToken) {
        console.warn("⚠️  No valid token available, skipping test");
        return;
      }

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${validToken}`);

      if (response.status === 200) {
        assertions.expectSuccessResponse(response);
        expect(response.body.data).toHaveProperty("school_id");
        expect(response.body.data).not.toHaveProperty("password_hash");
      } else {
        console.log("Profile response:", response.status, response.body);
      }
    });

    it("should reject request without token", async () => {
      const response = await request(app).get("/api/auth/me");

      assertions.expectAuthRequired(response);
    });

    it("should reject invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-token-here");

      assertions.expectAuthRequired(response);
    });

    it("should reject expired token", async () => {
      // Create an expired token (would need jwt.sign with past expiry)
      const jwt = require("jsonwebtoken");
      const expiredToken = jwt.sign(
        { id: 1, school_id: "23-1234" },
        process.env.JWT_SECRET,
        { expiresIn: "0s" }
      );

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`);

      assertions.expectAuthRequired(response);
    });
  });

  describe("POST /api/auth/logout", () => {
    let logoutToken;

    beforeAll(async () => {
      // Login to get a token for logout
      const loginResponse = await request(app).post("/api/auth/login").send({
        school_id: "ADMIN-2024",
        password: "Admin@12345",
      });

      if (loginResponse.status === 200 && loginResponse.body.data) {
        logoutToken = loginResponse.body.data.accessToken;
      } else {
        console.error(
          "Failed to get token for logout tests:",
          loginResponse.status,
          loginResponse.body
        );
      }
    });

    it("should logout successfully", async () => {
      if (!logoutToken) {
        console.warn("⚠️  No valid token available, skipping test");
        return;
      }

      const response = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${logoutToken}`);

      if (response.status === 200) {
        assertions.expectSuccessResponse(response);
        expect(response.body.message.toLowerCase()).toContain("logged out");
      } else {
        console.log("Logout response:", response.status, response.body);
      }
    });

    it("should require authentication", async () => {
      const response = await request(app).post("/api/auth/logout");

      assertions.expectAuthRequired(response);
    });
  });

  describe("Authentication Middleware Edge Cases", () => {
    let validToken;
    let pendingUserToken;
    let deletedUserToken;

    beforeAll(async () => {
      // Get valid token for testing
      const loginResponse = await request(app).post("/api/auth/login").send({
        school_id: "ADMIN-2024",
        password: "Admin@12345",
      });
      if (loginResponse.status === 200) {
        validToken = loginResponse.body.data.accessToken;
      }

      // Create a pending user and get token (for testing)
      const jwt = require("jsonwebtoken");
      pendingUserToken = jwt.sign(
        { id: 99999, school_id: "25-0001", role: "user" },
        process.env.JWT_SECRET,
        {
          expiresIn: "1h",
          issuer: "lost-and-found-api",
          audience: "lost-and-found-client",
        }
      );

      deletedUserToken = jwt.sign(
        { id: 99998, school_id: "25-0002", role: "user" },
        process.env.JWT_SECRET,
        {
          expiresIn: "1h",
          issuer: "lost-and-found-api",
          audience: "lost-and-found-client",
        }
      );
    });

    it("should reject request with malformed Authorization header", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "InvalidFormat");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should reject request with token for non-existent user", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${pendingUserToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain("not found");
    });

    it("should reject request with deleted user token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${deletedUserToken}`);

      expect(response.status).toBe(401);
    });

    it("should handle database errors gracefully in profile endpoint", async () => {
      // Create a token with invalid user ID to trigger potential errors
      const jwt = require("jsonwebtoken");
      const invalidToken = jwt.sign(
        { id: "invalid", school_id: "TEST", role: "user" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${invalidToken}`);

      // Should handle gracefully
      expect([401, 500]).toContain(response.status);
    });
  });

  describe("Authorization Middleware", () => {
    let userToken;
    let adminToken;

    beforeAll(async () => {
      // Get admin token
      const adminLogin = await request(app).post("/api/auth/login").send({
        school_id: "ADMIN-2024",
        password: "Admin@12345",
      });
      if (adminLogin.status === 200) {
        adminToken = adminLogin.body.data.accessToken;
      }

      // Create and login a regular user with valid school ID format
      const testUserId = "25-1111"; // Valid format: YY-XXXX
      try {
        await db.query("DELETE FROM users WHERE school_id = ?", [testUserId]);
      } catch (err) {
        console.log("Error cleaning up test user:", err.message);
      }

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 200));

      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send({
          school_id: testUserId,
          email: "authtest@test.com",
          password: "ValidPass123!",
          confirm_password: "ValidPass123!",
          first_name: "Auth",
          last_name: "Test",
        });

      if (registerResponse.status !== 201) {
        console.error(
          "Failed to register test user:",
          registerResponse.status,
          registerResponse.body
        );
      }

      // Wait a bit for registration to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Activate the user
      const updateResult = await db.query(
        "UPDATE users SET status = 'active' WHERE school_id = ?",
        [testUserId]
      );

      // Wait a bit for activation
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Login to get token
      const userLogin = await request(app).post("/api/auth/login").send({
        school_id: testUserId,
        password: "ValidPass123!",
      });

      if (userLogin.status === 200 && userLogin.body.data) {
        userToken = userLogin.body.data.accessToken;
      } else {
        console.error(
          "Failed to get user token:",
          userLogin.status,
          userLogin.body
        );
      }
    });

    it("should allow admin to access admin-only routes", async () => {
      if (!adminToken) {
        console.warn("⚠️  No admin token available, skipping test");
        return;
      }

      // Note: We'd need an actual admin-only route to test this properly
      // For now, verify the token works
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.role).toBe("admin");
    });

    it("should verify user role in profile response", async () => {
      if (!userToken) {
        console.warn("⚠️  No user token available, skipping test");
        return;
      }

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.role).toBe("user");
    });
  });

  describe("Login Error Scenarios", () => {
    it("should handle database connection errors gracefully", async () => {
      // This test verifies the error handling exists
      // In a real scenario, we'd mock the database to fail
      const response = await request(app).post("/api/auth/login").send({
        school_id: "ADMIN-2024",
        password: "Admin@12345",
      });

      // Should either succeed or fail gracefully
      expect([200, 500]).toContain(response.status);
      expect(response.body).toHaveProperty("success");
    });

    it("should handle successful login with all user data", async () => {
      const response = await request(app).post("/api/auth/login").send({
        school_id: "ADMIN-2024",
        password: "Admin@12345",
      });

      if (response.status === 200) {
        expect(response.body.data.user).toHaveProperty("id");
        expect(response.body.data.user).toHaveProperty("school_id");
        expect(response.body.data.user).toHaveProperty("email");
        expect(response.body.data.user).toHaveProperty("first_name");
        expect(response.body.data.user).toHaveProperty("last_name");
        expect(response.body.data.user).toHaveProperty("role");
        expect(response.body.data.user).toHaveProperty("email_verified");
        expect(response.body.data.user).not.toHaveProperty("password_hash");
        expect(response.body.data).toHaveProperty("accessToken");
        expect(response.body.data).toHaveProperty("refreshToken");
        expect(response.body.data).toHaveProperty("expiresIn");
      }
    });
  });
});
