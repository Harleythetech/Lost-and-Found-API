/**
 * Simplified Authentication Tests
 * Basic tests to verify the auth system is working
 */

// Set test environment before loading anything
process.env.NODE_ENV = "test";

// Load environment variables FIRST
require("dotenv").config();

const request = require("supertest");
const db = require("../src/config/database");

let app;

beforeAll(async () => {
  await db.initializePool();
  app = require("../index");
});

afterAll(async () => {
  await db.closePool();
});

describe("Authentication API - Basic Tests", () => {
  describe("POST /api/auth/register", () => {
    it("should reject weak password", async () => {
      const response = await request(app).post("/api/auth/register").send({
        school_id: "25-TEST1",
        password: "weak",
        password_confirmation: "weak",
        first_name: "Test",
        last_name: "User",
        email: "test@test.com",
      });

      expect(response.status).toBe(400);
    });

    it("should reject mismatched passwords", async () => {
      const response = await request(app).post("/api/auth/register").send({
        school_id: "25-TEST2",
        password: "SecurePass123!",
        password_confirmation: "DifferentPass123!",
        first_name: "Test",
        last_name: "User",
        email: "test2@test.com",
      });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    it("should reject missing credentials", async () => {
      const response = await request(app).post("/api/auth/login").send({});

      expect(response.status).toBe(400);
    });

    it("should reject non-existent user", async () => {
      const response = await request(app).post("/api/auth/login").send({
        school_id: "99-9999",
        password: "SomePassword123!",
      });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/auth/me", () => {
    it("should reject request without token", async () => {
      const response = await request(app).get("/api/auth/me");

      expect(response.status).toBe(401);
    });

    it("should reject invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid.token.here");

      expect(response.status).toBe(401);
    });
  });
});
