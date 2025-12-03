/**
 * Password Reset Service
 * Handles password reset token generation and validation
 */

const crypto = require("crypto");
const db = require("../config/database");

class PasswordResetService {
  /**
   * Generate a secure random token
   */
  generateResetToken() {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Create password reset token and store in database
   * Token expires in 1 hour
   */
  async createResetToken(userId) {
    const token = this.generateResetToken();

    // Store token in database - use MySQL DATE_ADD to avoid timezone issues
    const query = `
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
      ON DUPLICATE KEY UPDATE 
        token = VALUES(token),
        expires_at = DATE_ADD(NOW(), INTERVAL 1 HOUR),
        used = FALSE,
        created_at = NOW()
    `;

    await db.query(query, [userId, token]);

    // Get the expiry time from database
    const result = await db.query(
      "SELECT expires_at FROM password_reset_tokens WHERE token = ?",
      [token]
    );

    return { token, expiresAt: result[0]?.expires_at };
  }

  /**
   * Verify reset token is valid
   */
  async verifyResetToken(token) {
    const query = `
      SELECT 
        prt.*,
        u.id as user_id,
        u.email,
        u.school_id,
        u.first_name,
        u.last_name
      FROM password_reset_tokens prt
      JOIN users u ON prt.user_id = u.id
      WHERE prt.token = ?
        AND prt.used = FALSE
        AND prt.expires_at > NOW()
        AND u.deleted_at IS NULL
    `;

    const results = await db.query(query, [token]);

    if (results.length === 0) {
      return null;
    }

    return results[0];
  }

  /**
   * Mark token as used
   */
  async markTokenAsUsed(token) {
    const query = `
      UPDATE password_reset_tokens
      SET used = TRUE
      WHERE token = ?
    `;

    await db.query(query, [token]);
  }

  /**
   * Delete expired tokens (cleanup)
   */
  async cleanupExpiredTokens() {
    const query = `
      DELETE FROM password_reset_tokens
      WHERE expires_at < NOW() OR used = TRUE
    `;

    const result = await db.query(query);
    return result.affectedRows;
  }

  /**
   * Delete all tokens for a user
   */
  async deleteUserTokens(userId) {
    const query = `
      DELETE FROM password_reset_tokens
      WHERE user_id = ?
    `;

    await db.query(query, [userId]);
  }
}

module.exports = new PasswordResetService();
