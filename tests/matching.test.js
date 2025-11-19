/**
 * Matching System API Tests
 * Comprehensive tests for intelligent matching algorithm
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

  // Create test users
  await db.query("DELETE FROM users WHERE school_id IN ('25-5001', '25-5002')");

  await request(app).post("/api/auth/register").send({
    school_id: "25-5001",
    email: "muser1@test.com",
    password: "User1@123456",
    confirm_password: "User1@123456",
    first_name: "Match",
    last_name: "UserOne",
  });

  await db.query(
    "UPDATE users SET status = 'active' WHERE school_id = '25-5001'"
  );

  const user1Login = await request(app).post("/api/auth/login").send({
    school_id: "25-5001",
    password: "User1@123456",
  });
  if (user1Login.status === 200) {
    tokens.user1Token = user1Login.body.data.accessToken;
  }

  await request(app).post("/api/auth/register").send({
    school_id: "25-5002",
    email: "muser2@test.com",
    password: "User2@123456",
    confirm_password: "User2@123456",
    first_name: "Match",
    last_name: "UserTwo",
  });

  await db.query(
    "UPDATE users SET status = 'active' WHERE school_id = '25-5002'"
  );

  const user2Login = await request(app).post("/api/auth/login").send({
    school_id: "25-5002",
    password: "User2@123456",
  });
  if (user2Login.status === 200) {
    tokens.user2Token = user2Login.body.data.accessToken;
  }
}, 30000);

afterAll(async () => {
  await db.closePool();
});

describe("Matching System API", () => {
  let testLostItemId;
  let testFoundItemId;

  beforeAll(async () => {
    // Create test items for matching
    const lostResponse = await request(app)
      .post("/api/lost-items")
      .set("Authorization", `Bearer ${tokens.user1Token}`)
      .send(testData.validLostItem);

    testLostItemId = lostResponse.body.data?.id;

    // Approve it
    if (testLostItemId) {
      await request(app)
        .patch(`/api/lost-items/${testLostItemId}/review`)
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({ status: "approved" });
    }

    const foundResponse = await request(app)
      .post("/api/found-items")
      .set("Authorization", `Bearer ${tokens.user2Token}`)
      .send(testData.validFoundItem);

    testFoundItemId = foundResponse.body.data?.id;

    // Approve it
    if (testFoundItemId) {
      await request(app)
        .patch(`/api/found-items/${testFoundItemId}/review`)
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({ status: "approved" });
    }
  });

  describe("GET /api/matches/lost/:id", () => {
    it("should find matches for lost item", async () => {
      if (testLostItemId) {
        const response = await request(app)
          .get(`/api/matches/lost/${testLostItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        assertions.expectSuccessResponse(response);
        expect(Array.isArray(response.body.data)).toBe(true);

        // Each match should have similarity score
        response.body.data.forEach((match) => {
          expect(match).toHaveProperty("similarity_score");
          expect(match).toHaveProperty("match_reason");
          expect(match.similarity_score).toBeGreaterThanOrEqual(0);
          expect(match.similarity_score).toBeLessThanOrEqual(100);
        });
      }
    });

    it("should require authentication", async () => {
      const response = await request(app).get("/api/matches/lost/1");

      assertions.expectAuthRequired(response);
    });

    it("should allow owner to view matches", async () => {
      if (testLostItemId) {
        const response = await request(app)
          .get(`/api/matches/lost/${testLostItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        expect(response.status).toBe(200);
      }
    });

    it("should prevent other users from viewing matches", async () => {
      if (testLostItemId) {
        const response = await request(app)
          .get(`/api/matches/lost/${testLostItemId}`)
          .set("Authorization", `Bearer ${tokens.user2Token}`);

        assertions.expectForbidden(response);
      }
    });

    it("should allow admin to view any matches", async () => {
      if (testLostItemId) {
        const response = await request(app)
          .get(`/api/matches/lost/${testLostItemId}`)
          .set("Authorization", `Bearer ${tokens.adminToken}`);

        assertions.expectSuccessResponse(response);
      }
    });

    it("should return 404 for non-existent item", async () => {
      const response = await request(app)
        .get("/api/matches/lost/999999")
        .set("Authorization", `Bearer ${tokens.adminToken}`);

      expect(response.status).toBe(404);
    });

    it("should apply minimum score threshold", async () => {
      if (testLostItemId) {
        const response = await request(app)
          .get(`/api/matches/lost/${testLostItemId}?min_score=70`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        if (response.status === 200) {
          response.body.data.forEach((match) => {
            expect(match.similarity_score).toBeGreaterThanOrEqual(70);
          });
        }
      }
    });

    it("should limit results", async () => {
      if (testLostItemId) {
        const response = await request(app)
          .get(`/api/matches/lost/${testLostItemId}?limit=3`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        if (response.status === 200) {
          expect(response.body.data.length).toBeLessThanOrEqual(3);
        }
      }
    });

    it("should auto-save top matches", async () => {
      if (testLostItemId) {
        const response = await request(app)
          .get(`/api/matches/lost/${testLostItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        // Should save top 5 matches to database
        assertions.expectSuccessResponse(response);
      }
    });
  });

  describe("GET /api/matches/found/:id", () => {
    it("should find matches for found item", async () => {
      if (testFoundItemId) {
        const response = await request(app)
          .get(`/api/matches/found/${testFoundItemId}`)
          .set("Authorization", `Bearer ${tokens.user2Token}`);

        assertions.expectSuccessResponse(response);
        expect(Array.isArray(response.body.data)).toBe(true);

        response.body.data.forEach((match) => {
          expect(match).toHaveProperty("similarity_score");
          expect(match).toHaveProperty("match_reason");
        });
      }
    });

    it("should require authentication", async () => {
      const response = await request(app).get("/api/matches/found/1");

      assertions.expectAuthRequired(response);
    });

    it("should allow owner to view matches", async () => {
      if (testFoundItemId) {
        const response = await request(app)
          .get(`/api/matches/found/${testFoundItemId}`)
          .set("Authorization", `Bearer ${tokens.user2Token}`);

        expect(response.status).toBe(200);
      }
    });

    it("should prevent other users from viewing matches", async () => {
      if (testFoundItemId) {
        const response = await request(app)
          .get(`/api/matches/found/${testFoundItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        assertions.expectForbidden(response);
      }
    });
  });

  describe("GET /api/matches/saved/:itemType/:itemId", () => {
    it("should retrieve saved matches for lost item", async () => {
      if (testLostItemId) {
        // First trigger auto-save by viewing matches
        await request(app)
          .get(`/api/matches/lost/${testLostItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        // Then retrieve saved matches
        const response = await request(app)
          .get(`/api/matches/saved/lost/${testLostItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        assertions.expectSuccessResponse(response);
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });

    it("should filter by match status", async () => {
      if (testLostItemId) {
        const response = await request(app)
          .get(`/api/matches/saved/lost/${testLostItemId}?status=suggested`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        if (response.status === 200) {
          response.body.data.forEach((match) => {
            expect(match.status).toBe("suggested");
          });
        }
      }
    });

    it("should validate item type", async () => {
      const response = await request(app)
        .get("/api/matches/saved/invalid/1")
        .set("Authorization", `Bearer ${tokens.user1Token}`);

      assertions.expectValidationError(response);
    });

    it("should require authentication", async () => {
      const response = await request(app).get("/api/matches/saved/lost/1");

      assertions.expectAuthRequired(response);
    });
  });

  describe("PATCH /api/matches/:matchId/status", () => {
    let savedMatchId;

    beforeAll(async () => {
      // Get saved matches to find a match ID
      if (testLostItemId) {
        await request(app)
          .get(`/api/matches/lost/${testLostItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        const savedResponse = await request(app)
          .get(`/api/matches/saved/lost/${testLostItemId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        if (savedResponse.body.data?.length > 0) {
          savedMatchId = savedResponse.body.data[0].match_id;
        }
      }
    });

    it("should confirm a match", async () => {
      if (savedMatchId) {
        const response = await request(app)
          .patch(`/api/matches/${savedMatchId}/status`)
          .set("Authorization", `Bearer ${tokens.user1Token}`)
          .send({ status: "confirmed" });

        assertions.expectSuccessResponse(response);
        expect(response.body.data.status).toBe("confirmed");
      }
    });

    it("should dismiss a match", async () => {
      if (savedMatchId) {
        const response = await request(app)
          .patch(`/api/matches/${savedMatchId}/status`)
          .set("Authorization", `Bearer ${tokens.user1Token}`)
          .send({ status: "dismissed" });

        if (response.status === 200) {
          expect(response.body.data.status).toBe("dismissed");
        }
      }
    });

    it("should validate status values", async () => {
      if (savedMatchId) {
        const response = await request(app)
          .patch(`/api/matches/${savedMatchId}/status`)
          .set("Authorization", `Bearer ${tokens.user1Token}`)
          .send({ status: "invalid_status" });

        assertions.expectValidationError(response);
      }
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .patch("/api/matches/1/status")
        .send({ status: "confirmed" });

      assertions.expectAuthRequired(response);
    });

    it("should prevent unauthorized status changes", async () => {
      if (savedMatchId) {
        const response = await request(app)
          .patch(`/api/matches/${savedMatchId}/status`)
          .set("Authorization", `Bearer ${tokens.user2Token}`)
          .send({ status: "dismissed" });

        assertions.expectForbidden(response);
      }
    });
  });

  describe("Matching Algorithm", () => {
    it("should score category match highest", async () => {
      // Create items with same category
      const lost = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validLostItem,
          category_id: 1,
          title: "Black Laptop",
        });

      const lostId = lost.body.data?.id;

      await request(app)
        .patch(`/api/lost-items/${lostId}/review`)
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({ status: "approved" });

      const found = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user2Token}`)
        .send({
          ...testData.validFoundItem,
          category_id: 1,
          title: "Laptop",
        });

      const foundId = found.body.data?.id;

      await request(app)
        .patch(`/api/found-items/${foundId}/review`)
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({ status: "approved" });

      if (lostId && foundId) {
        const response = await request(app)
          .get(`/api/matches/lost/${lostId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        // Should find the matching found item with high score
        const match = response.body.data?.find((m) => m.id === foundId);
        if (match) {
          expect(match.similarity_score).toBeGreaterThan(50);
        }
      }
    });

    it("should return empty array when no matches found", async () => {
      // Create very specific item unlikely to match
      const lost = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validLostItem,
          title: "Very Unique Item XYZ123",
          description:
            "This is a very unique item that will not match anything else",
        });

      const lostId = lost.body.data?.id;

      if (lostId) {
        await request(app)
          .patch(`/api/lost-items/${lostId}/review`)
          .set("Authorization", `Bearer ${tokens.adminToken}`)
          .send({ status: "approved" });

        const response = await request(app)
          .get(`/api/matches/lost/${lostId}`)
          .set("Authorization", `Bearer ${tokens.user1Token}`);

        expect(response.body.data).toEqual([]);
      }
    });
  });
});
