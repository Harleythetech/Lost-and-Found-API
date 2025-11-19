/**
 * Quick Test - Verify test setup is working
 * Run this first to ensure Jest is configured correctly
 */

// Set test environment before loading anything
process.env.NODE_ENV = "test";

describe("Test Suite Configuration", () => {
  it("should run basic Jest test", () => {
    expect(true).toBe(true);
  });

  it("should perform arithmetic", () => {
    expect(2 + 2).toBe(4);
  });

  it("should handle async operations", async () => {
    const promise = Promise.resolve("success");
    await expect(promise).resolves.toBe("success");
  });

  it("should have process.env available", () => {
    expect(process.env).toBeDefined();
  });
});
