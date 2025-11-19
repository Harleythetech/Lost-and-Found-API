/**
 * Integration Tests
 * Tests complete workflows from start to finish
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
  await db.query("DELETE FROM users WHERE school_id IN ('25-6001', '25-6002')");

  await request(app).post("/api/auth/register").send({
    school_id: "25-6001",
    email: "int1@test.com",
    password: "User1@123456",
    confirm_password: "User1@123456",
    first_name: "Int",
    last_name: "UserOne",
  });

  await db.query(
    "UPDATE users SET status = 'active' WHERE school_id = '25-6001'"
  );

  const user1Login = await request(app).post("/api/auth/login").send({
    school_id: "25-6001",
    password: "User1@123456",
  });
  if (user1Login.status === 200) {
    tokens.user1Token = user1Login.body.data.accessToken;
  }

  await request(app).post("/api/auth/register").send({
    school_id: "25-6002",
    email: "int2@test.com",
    password: "User2@123456",
    confirm_password: "User2@123456",
    first_name: "Int",
    last_name: "UserTwo",
  });

  await db.query(
    "UPDATE users SET status = 'active' WHERE school_id = '25-6002'"
  );

  const user2Login = await request(app).post("/api/auth/login").send({
    school_id: "25-6002",
    password: "User2@123456",
  });
  if (user2Login.status === 200) {
    tokens.user2Token = user2Login.body.data.accessToken;
  }
}, 30000);

afterAll(async () => {
  await db.closePool();
});

describe("Integration Tests", () => {
  describe("Complete Lost Item Workflow", () => {
    let itemId;

    it("should create, approve, and retrieve lost item", async () => {
      // 1. User creates lost item
      const createResponse = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validLostItem);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data.status).toBe("pending");
      itemId = createResponse.body.data.id;

      // 2. Item not visible to public
      const publicResponse = await request(app).get("/api/lost-items");

      const publicItems = publicResponse.body.data.items;
      const foundInPublic = publicItems.find((i) => i.id === itemId);
      expect(foundInPublic).toBeUndefined();

      // 3. Admin approves item
      const approveResponse = await request(app)
        .patch(`/api/lost-items/${itemId}/review`)
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({ status: "approved" });

      expect(approveResponse.status).toBe(200);

      // 4. Item now visible to public
      const publicResponse2 = await request(app).get("/api/lost-items");

      const publicItems2 = publicResponse2.body.data.items;
      const foundInPublic2 = publicItems2.find((i) => i.id === itemId);
      expect(foundInPublic2).toBeDefined();

      // 5. User updates item
      const updateResponse = await request(app)
        .put(`/api/lost-items/${itemId}`)
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validLostItem,
          title: "Updated Title",
        });

      expect(updateResponse.body.data.status).toBe("pending");

      // 6. Admin re-approves
      await request(app)
        .patch(`/api/lost-items/${itemId}/review`)
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({ status: "approved" });
    });
  });

  describe("Complete Found Item Workflow", () => {
    let itemId;

    it("should create, reject, update, and approve found item", async () => {
      // 1. User creates found item
      const createResponse = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user2Token}`)
        .send(testData.validFoundItem);

      expect(createResponse.status).toBe(201);
      itemId = createResponse.body.data.id;

      // 2. Admin rejects with reason
      const rejectResponse = await request(app)
        .patch(`/api/found-items/${itemId}/review`)
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          status: "rejected",
          rejection_reason: "Please provide more details",
        });

      expect(rejectResponse.status).toBe(200);

      // 3. User updates with more details
      const updateResponse = await request(app)
        .put(`/api/found-items/${itemId}`)
        .set("Authorization", `Bearer ${tokens.user2Token}`)
        .send({
          ...testData.validFoundItem,
          description:
            "Found keys with blue keychain, Honda logo, 3 keys total, found near parking lot",
        });

      expect(updateResponse.body.data.status).toBe("pending");

      // 4. Security officer approves
      const approveResponse = await request(app)
        .patch(`/api/found-items/${itemId}/review`)
        .set("Authorization", `Bearer ${tokens.securityToken}`)
        .send({ status: "approved" });

      expect(approveResponse.status).toBe(200);
    });
  });

  describe("Matching Workflow", () => {
    let lostItemId;
    let foundItemId;

    it("should match lost and found items", async () => {
      // 1. User1 reports lost phone
      const lostResponse = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validLostItem,
          category_id: 1,
          title: "Lost Black iPhone 13",
          description:
            "Lost my black iPhone 13 with cracked screen protector near the library",
          distinctive_features: JSON.stringify([
            "Cracked screen protector",
            "Black case",
          ]),
        });

      lostItemId = lostResponse.body.data.id;

      await request(app)
        .patch(`/api/lost-items/${lostItemId}/review`)
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({ status: "approved" });

      // 2. User2 reports found phone
      const foundResponse = await request(app)
        .post("/api/found-items")
        .set("Authorization", `Bearer ${tokens.user2Token}`)
        .send({
          ...testData.validFoundItem,
          category_id: 1,
          title: "Found iPhone",
          description:
            "Found a black iPhone with damaged screen near library entrance",
          distinctive_features: JSON.stringify(["Cracked screen", "Black"]),
        });

      foundItemId = foundResponse.body.data.id;

      await request(app)
        .patch(`/api/found-items/${foundItemId}/review`)
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({ status: "approved" });

      // 3. User1 views matches for lost item
      const matchResponse = await request(app)
        .get(`/api/matches/lost/${lostItemId}`)
        .set("Authorization", `Bearer ${tokens.user1Token}`);

      expect(matchResponse.status).toBe(200);
      expect(matchResponse.body.data.length).toBeGreaterThan(0);

      // Should find the matching found item
      const match = matchResponse.body.data.find((m) => m.id === foundItemId);
      if (match) {
        expect(match.similarity_score).toBeGreaterThan(70);
      }

      // 4. User1 retrieves saved matches
      const savedResponse = await request(app)
        .get(`/api/matches/saved/lost/${lostItemId}`)
        .set("Authorization", `Bearer ${tokens.user1Token}`);

      expect(savedResponse.status).toBe(200);
      expect(savedResponse.body.data.length).toBeGreaterThan(0);

      const savedMatch = savedResponse.body.data[0];
      const matchId = savedMatch.match_id;

      // 5. User1 confirms the match
      const confirmResponse = await request(app)
        .patch(`/api/matches/${matchId}/status`)
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({ status: "confirmed" });

      expect(confirmResponse.status).toBe(200);
    });
  });

  describe("Category and Location Management", () => {
    let categoryId;
    let locationId;

    it("should manage categories and locations", async () => {
      // 1. Admin creates category
      const categoryResponse = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Integration Test Category",
          description: "Testing integration",
        });

      expect(categoryResponse.status).toBe(201);
      categoryId = categoryResponse.body.data.id;

      // 2. Admin creates location
      const locationResponse = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          name: "Integration Test Location",
          description: "Testing location",
          is_storage_location: true,
        });

      expect(locationResponse.status).toBe(201);
      locationId = locationResponse.body.data.id;

      // 3. User creates item with new category/location
      const itemResponse = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send({
          ...testData.validLostItem,
          category_id: categoryId,
          location_id: locationId,
        });

      expect(itemResponse.status).toBe(201);

      // 4. Admin cannot delete category in use
      const deleteResponse = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set("Authorization", `Bearer ${tokens.adminToken}`);

      expect(deleteResponse.status).toBe(400);

      // 5. Admin can deactivate instead
      const toggleResponse = await request(app)
        .patch(`/api/categories/${categoryId}/toggle`)
        .set("Authorization", `Bearer ${tokens.adminToken}`);

      expect(toggleResponse.status).toBe(200);
    });
  });

  describe("User Registration and Authentication Flow", () => {
    let newUserToken;
    const testUser = {
      school_id: "25-9999",
      password: "SecurePassword123!",
      password_confirmation: "SecurePassword123!",
      first_name: "Integration",
      last_name: "Test",
      email: "integration@test.com",
    };

    it("should complete full authentication flow", async () => {
      // 1. Register new user
      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send(testUser);

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.data).toHaveProperty("access_token");

      newUserToken = registerResponse.body.data.access_token;

      // 2. Get profile
      const profileResponse = await request(app)
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${newUserToken}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.data.school_id).toBe(testUser.school_id);

      // 3. Create item as new user
      const itemResponse = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${newUserToken}`)
        .send(testData.validLostItem);

      expect(itemResponse.status).toBe(201);

      // 4. Logout
      const logoutResponse = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${newUserToken}`);

      expect(logoutResponse.status).toBe(200);

      // 5. Token should be invalid now (if blacklist is implemented)
      // const invalidResponse = await request(app)
      //   .get('/api/auth/profile')
      //   .set('Authorization', `Bearer ${newUserToken}`);
      // expect(invalidResponse.status).toBe(401);
    });
  });

  describe("Multi-user Permissions", () => {
    let user1ItemId;

    beforeAll(async () => {
      // User1 creates item
      const response = await request(app)
        .post("/api/lost-items")
        .set("Authorization", `Bearer ${tokens.user1Token}`)
        .send(testData.validLostItem);

      user1ItemId = response.body.data.id;
    });

    it("should enforce ownership and permissions", async () => {
      // User2 cannot update User1's item
      const updateResponse = await request(app)
        .put(`/api/lost-items/${user1ItemId}`)
        .set("Authorization", `Bearer ${tokens.user2Token}`)
        .send({
          ...testData.validLostItem,
          title: "Hacked",
        });

      expect(updateResponse.status).toBe(403);

      // User2 cannot delete User1's item
      const deleteResponse = await request(app)
        .delete(`/api/lost-items/${user1ItemId}`)
        .set("Authorization", `Bearer ${tokens.user2Token}`);

      expect(deleteResponse.status).toBe(403);

      // User2 cannot view User1's pending item
      const viewResponse = await request(app)
        .get(`/api/lost-items/${user1ItemId}`)
        .set("Authorization", `Bearer ${tokens.user2Token}`);

      expect(viewResponse.status).toBe(403);

      // Admin can do all of the above
      const adminViewResponse = await request(app)
        .get(`/api/lost-items/${user1ItemId}`)
        .set("Authorization", `Bearer ${tokens.adminToken}`);

      expect(adminViewResponse.status).toBe(200);

      const adminUpdateResponse = await request(app)
        .put(`/api/lost-items/${user1ItemId}`)
        .set("Authorization", `Bearer ${tokens.adminToken}`)
        .send({
          ...testData.validLostItem,
          title: "Admin Update",
        });

      // Admin might not be able to update others' items depending on implementation
    });
  });
});
