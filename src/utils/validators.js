/**
 * Input Validation Schemas
 * Using express-validator for comprehensive input validation
 *
 * SECURITY MEASURES:
 * 1. Whitelist validation (only allow expected fields)
 * 2. Type checking and format validation
 * 3. Length limits to prevent buffer overflow
 * 4. Sanitization to prevent XSS and injection
 * 5. School ID format enforcement (23-XXXX)
 */

const { body, param, query } = require("express-validator");

/**
 * School ID Validation
 * Format: YY-XXXX (e.g., 23-1234, 24-5678)
 * - YY: 2-digit year
 * - XXXX: 4-digit student number
 */
const schoolIdValidator = body("school_id")
  .trim()
  .matches(/^\d{2}-\d{4}$/)
  .withMessage("School ID must be in format YY-XXXX (e.g., 23-1234)")
  .isLength({ min: 7, max: 7 })
  .withMessage("School ID must be exactly 7 characters");

/**
 * Password Validation
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const passwordValidator = body("password")
  .isLength({ min: 8, max: 128 })
  .withMessage("Password must be between 8 and 128 characters")
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .withMessage(
    "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)"
  );

/**
 * Email Validation (Optional for Firebase auth)
 */
const emailValidator = body("email")
  .optional({ checkFalsy: true })
  .trim()
  .isEmail()
  .withMessage("Must be a valid email address")
  .normalizeEmail()
  .isLength({ max: 255 })
  .withMessage("Email must not exceed 255 characters");

/**
 * Registration Validation Rules
 */
const registerValidation = [
  schoolIdValidator,

  body("first_name")
    .trim()
    .notEmpty()
    .withMessage("First name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("First name must be between 2 and 100 characters")
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage(
      "First name can only contain letters, spaces, hyphens, and apostrophes"
    )
    .escape(), // XSS protection

  body("last_name")
    .trim()
    .notEmpty()
    .withMessage("Last name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Last name must be between 2 and 100 characters")
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage(
      "Last name can only contain letters, spaces, hyphens, and apostrophes"
    )
    .escape(),

  emailValidator,

  body("contact_number")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^(\+63|0)?[0-9]{10}$/)
    .withMessage("Contact number must be a valid Philippine phone number")
    .isLength({ max: 20 }),

  passwordValidator,

  body("confirm_password")
    .custom((value, { req }) => value === req.body.password)
    .withMessage("Passwords do not match"),

  // Additional security: limit request size
  body().custom((value, { req }) => {
    const allowedFields = [
      "school_id",
      "first_name",
      "last_name",
      "email",
      "contact_number",
      "password",
      "confirm_password",
    ];
    const receivedFields = Object.keys(req.body);
    const unexpectedFields = receivedFields.filter(
      (field) => !allowedFields.includes(field)
    );
    if (unexpectedFields.length > 0) {
      throw new Error(`Unexpected fields: ${unexpectedFields.join(", ")}`);
    }
    return true;
  }),
];

/**
 * Login Validation Rules
 */
const loginValidation = [
  body("school_id")
    .trim()
    .notEmpty()
    .withMessage("School ID is required")
    .matches(/^(\d{2}-\d{4}|ADMIN-\d{4})$/)
    .withMessage("Invalid School ID format (use YY-XXXX or ADMIN-YYYY)"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 1, max: 128 }),

  // Prevent additional fields
  body().custom((value, { req }) => {
    const allowedFields = ["school_id", "password"];
    const receivedFields = Object.keys(req.body);
    const unexpectedFields = receivedFields.filter(
      (field) => !allowedFields.includes(field)
    );
    if (unexpectedFields.length > 0) {
      throw new Error(`Unexpected fields: ${unexpectedFields.join(", ")}`);
    }
    return true;
  }),
];

/**
 * ID Parameter Validation (for routes like /users/:id)
 */
const idParamValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("ID must be a positive integer")
    .toInt(),
];

module.exports = {
  registerValidation,
  loginValidation,
  idParamValidation,
  schoolIdValidator,
  passwordValidator,
  emailValidator,
};
