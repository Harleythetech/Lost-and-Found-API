/**
 * Jest Test Setup
 * Global configuration and helpers for all tests
 */

// Load environment variables FIRST before any other imports
require("dotenv").config();

const { initializePool, closePool } = require("../src/config/database");

// Increase timeout for database operations
jest.setTimeout(30000);

// Global test state
global.testState = {
  adminToken: null,
  userToken: null,
  secondUserToken: null,
  testUserId: null,
  testLostItemId: null,
  testFoundItemId: null,
  testClaimId: null,
};

// Initialize database before all tests
beforeAll(async () => {
  try {
    await initializePool();
    console.log("Database pool initialized for tests");
  } catch (error) {
    console.error("Error initializing database pool:", error);
    throw error; // Fail fast if database can't connect
  }
});

// Cleanup after all tests
afterAll(async () => {
  try {
    await closePool();
    console.log("Database pool closed after tests");
  } catch (error) {
    console.error("Error closing database pool:", error);
  }
});

// Console error suppression for expected errors
const originalError = console.error;
const originalLog = console.log;

beforeAll(() => {
  // Suppress expected validation errors during tests
  console.error = (...args) => {
    const msg = args[0];
    // Suppress database errors and validation errors during torture tests
    if (
      typeof msg === "string" &&
      (msg.includes("Validation") ||
        msg.includes("Database query error") ||
        msg.includes("error") ||
        msg.includes("]:"))
    ) {
      return;
    }
    originalError.apply(console, args);
  };

  // Suppress noisy logs during tests
  console.log = (...args) => {
    const msg = args[0];
    if (
      typeof msg === "string" &&
      (msg.includes("Database pool") ||
        msg.includes("initialized") ||
        msg.includes("Firebase"))
    ) {
      return;
    }
    originalLog.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.log = originalLog;
});
