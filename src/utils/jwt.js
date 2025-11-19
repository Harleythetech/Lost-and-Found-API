/**
 * JWT Utilities - Secure Token Management
 *
 * SECURITY FEATURES:
 * 1. Access tokens (short-lived: 7 days)
 * 2. Refresh tokens (long-lived: 30 days)
 * 3. Token rotation on refresh
 * 4. Secure signing with HS256
 */

const jwt = require("jsonwebtoken");
const logger = require("./logger");

/**
 * Generate Access Token
 * Short-lived token for API authentication
 *
 * @param {Object} payload - User data to encode
 * @returns {string} JWT access token
 */
const generateAccessToken = (payload) => {
  try {
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      issuer: "lost-and-found-api",
      audience: "lost-and-found-client",
    });
  } catch (error) {
    logger.error("Error generating access token:", error);
    throw new Error("Token generation failed");
  }
};

/**
 * Generate Refresh Token
 * Long-lived token for obtaining new access tokens
 *
 * @param {Object} payload - User data to encode
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
  try {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
      issuer: "lost-and-found-api",
      audience: "lost-and-found-client",
    });
  } catch (error) {
    logger.error("Error generating refresh token:", error);
    throw new Error("Refresh token generation failed");
  }
};

/**
 * Verify Access Token
 *
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "lost-and-found-api",
      audience: "lost-and-found-client",
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Token has expired");
    } else if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    }
    throw error;
  }
};

/**
 * Verify Refresh Token
 *
 * @param {string} token - Refresh token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      issuer: "lost-and-found-api",
      audience: "lost-and-found-client",
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Refresh token has expired");
    } else if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid refresh token");
    }
    throw error;
  }
};

/**
 * Generate Token Pair
 * Creates both access and refresh tokens
 *
 * @param {Object} user - User object
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokenPair = (user) => {
  const payload = {
    id: user.id,
    school_id: user.school_id,
    role: user.role,
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
};
