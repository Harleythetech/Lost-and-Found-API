/**
 * Validation Error Formatter
 * Converts express-validator errors into user-friendly messages
 */

/**
 * Format validation errors for API response
 * @param {Array} errors - Array of express-validator errors
 * @returns {Object} Formatted error response
 */
const formatValidationErrors = (errors) => {
  // Group errors by field
  const fieldErrors = {};
  const errorMessages = [];

  errors.forEach((error) => {
    const field = error.path || error.param;
    const message = error.msg;

    // Add to field-specific errors
    if (field) {
      if (!fieldErrors[field]) {
        fieldErrors[field] = [];
      }
      fieldErrors[field].push(message);
    }

    // Add to general error messages (avoid duplicates)
    if (!errorMessages.includes(message)) {
      errorMessages.push(message);
    }
  });

  // Create user-friendly message
  const primaryMessage =
    errorMessages.length === 1
      ? errorMessages[0]
      : `${errorMessages.length} validation errors found`;

  return {
    success: false,
    message: primaryMessage,
    errors: fieldErrors,
    details: errorMessages,
  };
};

module.exports = { formatValidationErrors };
