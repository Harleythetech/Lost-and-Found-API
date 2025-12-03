/**
 * Test Helpers
 * Utility functions for test suite
 */

const request = require("supertest");
const app = require("../index");

// Generate unique identifiers
const generateSchoolId = () => {
  const year = Math.floor(Math.random() * 5) + 20; // 20-24
  const num = Math.floor(Math.random() * 90000) + 10000; // 10000-99999
  return `${year}-${num}`;
};

const generateEmail = (prefix = "test") => {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}@test.com`;
};

// Create a test user and get token
const createTestUser = async (overrides = {}) => {
  const userData = {
    school_id: generateSchoolId(),
    email: generateEmail(),
    password: "Test@123456",
    first_name: "Test",
    last_name: "User",
    contact_number: "09123456789",
    date_of_birth: "2000-01-15",
    gender: "male",
    address_line1: "123 Test Street",
    city: "Manila",
    province: "Metro Manila",
    postal_code: "1000",
    emergency_contact_name: "Emergency Contact",
    emergency_contact_number: "09987654321",
    department: "Computer Science",
    year_level: "3rd Year",
    ...overrides,
  };

  const response = await request(app).post("/api/auth/register").send(userData);

  return { userData, response };
};

// Login and get token
const loginUser = async (school_id, password) => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ school_id, password });

  return response;
};

// Create admin user (requires existing admin to approve)
const activateUser = async (adminToken, userId) => {
  const response = await request(app)
    .post(`/api/auth/users/${userId}/manage`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ action: "approve" });

  return response;
};

// SQL Injection payloads
const sqlInjectionPayloads = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  "1; SELECT * FROM users",
  "' UNION SELECT * FROM users--",
  "admin'--",
  "1' OR '1'='1' /*",
  "' OR 1=1--",
  "' OR ''='",
  "'; EXEC xp_cmdshell('dir'); --",
  "1; WAITFOR DELAY '0:0:5'--",
  "' AND 1=(SELECT COUNT(*) FROM users); --",
  "'; INSERT INTO users VALUES('hacked'); --",
];

// XSS payloads
const xssPayloads = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror=alert("XSS")>',
  '<svg onload=alert("XSS")>',
  'javascript:alert("XSS")',
  '<body onload=alert("XSS")>',
  '"><script>alert("XSS")</script>',
  "'-alert('XSS')-'",
  "<iframe src=\"javascript:alert('XSS')\">",
  "<div style=\"background:url(javascript:alert('XSS'))\">",
  '{{constructor.constructor("alert(1)")()}}',
];

// NoSQL injection payloads
const noSqlInjectionPayloads = [
  '{"$gt": ""}',
  '{"$ne": null}',
  '{"$where": "sleep(5000)"}',
  '{"$regex": ".*"}',
  "{'$gt': ''}",
];

// Path traversal payloads
const pathTraversalPayloads = [
  "../../../etc/passwd",
  "..\\..\\..\\windows\\system32\\config\\sam",
  "....//....//....//etc/passwd",
  "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
  "..%252f..%252f..%252fetc/passwd",
];

// Command injection payloads
const commandInjectionPayloads = [
  "; ls -la",
  "| cat /etc/passwd",
  "`whoami`",
  "$(whoami)",
  "; ping -c 10 127.0.0.1",
  "& dir",
  "| type C:\\Windows\\System32\\drivers\\etc\\hosts",
];

// Overflow payloads
const overflowPayloads = {
  longString: "A".repeat(10000),
  veryLongString: "B".repeat(100000),
  unicodeBomb: "\u202E".repeat(1000),
  nullBytes: "\x00".repeat(100),
  specialChars: "!@#$%^&*()_+-=[]{}|;:'\",.<>?/\\`~".repeat(100),
};

// Malicious file names
const maliciousFileNames = [
  "../../../etc/passwd",
  "test.php",
  "test.exe",
  "test.js",
  "<script>alert(1)</script>.jpg",
  "test.jpg.php",
  "....jpg",
  "test\x00.jpg",
];

module.exports = {
  app,
  request,
  generateSchoolId,
  generateEmail,
  createTestUser,
  loginUser,
  activateUser,
  sqlInjectionPayloads,
  xssPayloads,
  noSqlInjectionPayloads,
  pathTraversalPayloads,
  commandInjectionPayloads,
  overflowPayloads,
  maliciousFileNames,
};
