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
 * Format: XX-XXXXX (e.g., 23-12345, 24-56789)
 * - XX: 2-digit year
 * - XXXXX: 5-digit student number
 */
const schoolIdValidator = body("school_id")
  .trim()
  .notEmpty()
  .withMessage("School ID is required")
  .matches(/^\d{2}-\d{5}$/)
  .withMessage("School ID must be in format XX-XXXXX (e.g., 23-12345)")
  .isLength({ min: 8, max: 8 })
  .withMessage("School ID must be exactly 8 characters");

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
 * Email Validation (Required)
 */
const emailValidator = body("email")
  .trim()
  .notEmpty()
  .withMessage("Email is required")
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
    .trim()
    .notEmpty()
    .withMessage("Contact number is required")
    .matches(/^(09|\+639)[0-9]{9}$/)
    .withMessage(
      "Contact number must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)"
    )
    .isLength({ min: 11, max: 13 })
    .withMessage("Contact number must be 11-13 characters"),

  passwordValidator,

  body("confirm_password")
    .custom((value, { req }) => value === req.body.password)
    .withMessage("Passwords do not match"),

  // Required personal information fields
  body("date_of_birth")
    .notEmpty()
    .withMessage("Date of birth is required")
    .isISO8601()
    .withMessage("Date of birth must be in YYYY-MM-DD format"),

  body("gender")
    .notEmpty()
    .withMessage("Gender is required")
    .isIn(["male", "female", "other", "prefer_not_to_say"])
    .withMessage("Gender must be male, female, other, or prefer_not_to_say"),

  body("address_line1")
    .trim()
    .notEmpty()
    .withMessage("Address is required")
    .isLength({ max: 255 })
    .withMessage("Address line 1 must be less than 255 characters")
    .escape(),

  body("address_line2")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage("Address line 2 must be less than 255 characters")
    .escape(),

  body("city")
    .trim()
    .notEmpty()
    .withMessage("City is required")
    .isLength({ max: 100 })
    .withMessage("City must be less than 100 characters")
    .escape(),

  body("province")
    .trim()
    .notEmpty()
    .withMessage("Province is required")
    .isLength({ max: 100 })
    .withMessage("Province must be less than 100 characters")
    .escape(),

  body("postal_code")
    .trim()
    .notEmpty()
    .withMessage("Postal code is required")
    .isLength({ max: 20 })
    .withMessage("Postal code must be less than 20 characters")
    .escape(),

  body("emergency_contact_name")
    .trim()
    .notEmpty()
    .withMessage("Emergency contact name is required")
    .isLength({ max: 200 })
    .withMessage("Emergency contact name must be less than 200 characters")
    .escape(),

  body("emergency_contact_number")
    .trim()
    .notEmpty()
    .withMessage("Emergency contact number is required")
    .matches(/^[0-9+\-()\s]{7,20}$/)
    .withMessage("Invalid emergency contact number format"),

  body("department")
    .trim()
    .notEmpty()
    .withMessage("Department is required")
    .isLength({ max: 100 })
    .withMessage("Department must be less than 100 characters")
    .escape(),

  body("year_level")
    .trim()
    .notEmpty()
    .withMessage("Year level is required")
    .isLength({ max: 50 })
    .withMessage("Year level must be less than 50 characters")
    .escape(),

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
      // Optional personal info fields
      "date_of_birth",
      "gender",
      "address_line1",
      "address_line2",
      "city",
      "province",
      "postal_code",
      "emergency_contact_name",
      "emergency_contact_number",
      "department",
      "year_level",
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
    .matches(/^(\d{2}-\d{5}|ADMIN-\d{4})$/)
    .withMessage("Invalid School ID format (use XX-XXXXX or ADMIN-YYYY)"),

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
