/**
 * Test Helpers and Utilities
 */

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

/**
 * Generate test user tokens
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      school_id: user.school_id,
      role: user.role,
      status: user.status,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h",
      issuer: "lost-and-found-api",
      audience: "lost-and-found-client",
    }
  );
}

/**
 * Create test users with different roles
 */
const testUsers = {
  admin: {
    id: 999,
    school_id: "ADMIN-2024",
    email: "admin@test.com",
    password: "Admin@123456",
    role: "admin",
    status: "active",
  },
  user1: {
    id: 1000,
    school_id: "23-1001",
    email: "user1@test.com",
    password: "User1@123456",
    role: "user",
    status: "active",
  },
  user2: {
    id: 1001,
    school_id: "23-1002",
    email: "user2@test.com",
    password: "User2@123456",
    role: "user",
    status: "active",
  },
  security: {
    id: 1002,
    school_id: "SEC-2024",
    email: "security@test.com",
    password: "Security@123456",
    role: "security",
    status: "active",
  },
  suspended: {
    id: 1003,
    school_id: "23-1003",
    email: "suspended@test.com",
    password: "Suspended@123456",
    role: "user",
    status: "suspended",
  },
};

/**
 * Generate tokens for all test users
 */
function generateTestTokens() {
  return {
    adminToken: generateToken(testUsers.admin),
    user1Token: generateToken(testUsers.user1),
    user2Token: generateToken(testUsers.user2),
    securityToken: generateToken(testUsers.security),
    suspendedToken: generateToken(testUsers.suspended),
  };
}

/**
 * Hash password for test users
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 12);
}

/**
 * Test data generators
 */
const testData = {
  validLostItem: {
    title: "Black iPhone 13 Pro",
    description:
      "Lost my black iPhone 13 Pro with a blue case. Has a cracked screen protector.",
    category_id: 1,
    last_seen_location_id: 3,
    last_seen_date: "2025-10-20",
    last_seen_time: "14:30",
    unique_identifiers: "IMEI: 123456789012345",
    reward_offered: 500,
  },
  validFoundItem: {
    title: "Blue Backpack with Books",
    description:
      "Found a blue JanSport backpack containing textbooks and notebooks.",
    category_id: 2,
    found_location_id: 5,
    found_date: "2025-10-21",
    found_time: "09:15",
    storage_location_id: 8,
    storage_notes: "Security Office - Shelf A3",
    turned_in_to_security: true,
    unique_identifiers: "JanSport brand",
  },
  validCategory: {
    name: `Test Category ${Date.now()}`,
    description: "Test category description",
    icon: "test-icon",
  },
  validLocation: {
    name: `Test Location ${Date.now()}`,
    building: "Test Building",
    floor: "3F",
    description: "Test location description",
    is_storage: true,
  },
};

/**
 * Common test assertions
 */
const assertions = {
  expectSuccessResponse: (response) => {
    expect(response.body).toHaveProperty("success", true);
  },
  expectErrorResponse: (response, status = 400) => {
    expect(response.status).toBe(status);
    expect(response.body).toHaveProperty("success", false);
    expect(response.body).toHaveProperty("message");
  },
  expectValidationError: (response) => {
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("success", false);
    expect(response.body).toHaveProperty("errors");
    expect(Array.isArray(response.body.errors)).toBe(true);
  },
  expectAuthRequired: (response) => {
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("success", false);
  },
  expectForbidden: (response) => {
    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("success", false);
  },
};

module.exports = {
  testUsers,
  generateToken,
  generateTestTokens,
  hashPassword,
  testData,
  assertions,
};
