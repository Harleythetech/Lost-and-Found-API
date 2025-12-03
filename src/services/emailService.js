/**
 * Email Service using MailerSend API
 * Handles all email sending functionality
 */

const { MailerSend, EmailParams, Sender, Recipient } = require("mailersend");

class EmailService {
  constructor() {
    this.apiKey = process.env.MAILERSEND_API_KEY;
    this.fromEmail =
      process.env.MAILERSEND_FROM_EMAIL ||
      "MS_BdmQJB@trial-351ndgwevpmgzqx8.mlsender.net";
    this.fromName = process.env.MAILERSEND_FROM_NAME || "Lost and Found System";
    this.frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    this.apiUrl = process.env.API_URL || "http://localhost:8080";

    // Initialize MailerSend client
    this.mailerSend = new MailerSend({
      apiKey: this.apiKey,
    });
  }

  /**
   * Generate unsubscribe link for email footer
   */
  getUnsubscribeLink(email) {
    const token = Buffer.from(email).toString("base64");
    return `${this.apiUrl}/api/notifications/unsubscribe/${token}`;
  }

  /**
   * Get email footer with unsubscribe link
   */
  getEmailFooter(email) {
    const unsubscribeUrl = this.getUnsubscribeLink(email);
    return `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center;">
        <p>Lost and Found System - Helping reunite people with their belongings</p>
        <p>
          <a href="${unsubscribeUrl}" style="color: #999;">Unsubscribe from email notifications</a>
        </p>
      </div>
    `;
  }

  /**
   * Check if user has email notifications enabled
   */
  async shouldSendEmail(userId) {
    try {
      const db = require("../config/database");
      const users = await db.query(
        "SELECT email_notifications FROM users WHERE id = ? AND deleted_at IS NULL",
        [userId]
      );
      if (users.length === 0) return false;
      return users[0].email_notifications === 1;
    } catch (error) {
      console.error("Check email preference error:", error);
      return true; // Default to sending if error checking
    }
  }

  /**
   * Send a generic email
   */
  async sendEmail({ to, subject, html, text, skipPreferenceCheck = false, userId = null }) {
    try {
      // Check email preferences (skip for critical emails like password reset)
      if (!skipPreferenceCheck && userId) {
        const shouldSend = await this.shouldSendEmail(userId);
        if (!shouldSend) {
          console.log(`Email skipped for user ${userId} - notifications disabled`);
          return { success: true, skipped: true, reason: "notifications_disabled" };
        }
      }

      const sentFrom = new Sender(this.fromEmail, this.fromName);
      const recipients = [new Recipient(to)];

      // Add unsubscribe footer to HTML
      const htmlWithFooter = html + this.getEmailFooter(to);

      const emailParams = new EmailParams()
        .setFrom(sentFrom)
        .setTo(recipients)
        .setSubject(subject)
        .setHtml(htmlWithFooter)
        .setText(text || this.stripHtml(html));

      const response = await this.mailerSend.email.send(emailParams);
      console.log("Email sent successfully:", response);
      return { success: true, response };
    } catch (error) {
      console.error("Email sending failed:", error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(user) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Lost and Found System!</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your account has been successfully created.</p>
        <p><strong>School ID:</strong> ${user.school_id}</p>
        <p>You can now report lost items or browse found items to help reunite them with their owners.</p>
        <p>Best regards,<br>Lost and Found Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Welcome to Lost and Found System",
      html,
    });
  }

  /**
   * Send notification when a potential match is found
   */
  async sendMatchNotification(user, lostItem, foundItem) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Potential Match Found!</h2>
        <p>Hi ${user.first_name},</p>
        <p>We found a potential match for your lost item:</p>
        
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <h3>Your Lost Item:</h3>
          <p><strong>${lostItem.title}</strong></p>
          <p>${lostItem.description}</p>
          <p>Lost on: ${new Date(
            lostItem.last_seen_date
          ).toLocaleDateString()}</p>
        </div>

        <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <h3>Matching Found Item:</h3>
          <p><strong>${foundItem.title}</strong></p>
          <p>${foundItem.description}</p>
          <p>Found on: ${new Date(
            foundItem.found_date
          ).toLocaleDateString()}</p>
        </div>

        <p>
          <a href="${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/items/${foundItem.id}" 
             style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Item Details
          </a>
        </p>

        <p>Best regards,<br>Lost and Found Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Potential Match Found for Your Lost Item",
      html,
    });
  }

  /**
   * Send notification when item status changes
   */
  async sendStatusUpdateEmail(user, item, itemType, newStatus) {
    const statusMessages = {
      pending: "is pending approval",
      approved: "has been approved",
      rejected: "has been rejected",
      matched: "has been matched",
      claimed: "has been claimed",
      resolved: "has been resolved",
      archived: "has been archived",
    };

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Item Status Update</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your ${itemType} item "${item.title}" ${
      statusMessages[newStatus] || `status changed to ${newStatus}`
    }.</p>
        
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <p><strong>Item:</strong> ${item.title}</p>
          <p><strong>Description:</strong> ${item.description}</p>
          <p><strong>Status:</strong> ${newStatus}</p>
        </div>

        <p>
          <a href="${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/my-items" 
             style="background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View My Items
          </a>
        </p>

        <p>Best regards,<br>Lost and Found Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: `Item Status Update: ${item.title}`,
      html,
    });
  }

  /**
   * Send claim notification to item owner
   */
  async sendClaimNotification(owner, claimer, item) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Someone Claimed Your Found Item!</h2>
        <p>Hi ${owner.first_name},</p>
        <p>${claimer.first_name} ${claimer.last_name} (${
      claimer.school_id
    }) has claimed your found item.</p>
        
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <p><strong>Item:</strong> ${item.title}</p>
          <p><strong>Description:</strong> ${item.description}</p>
          <p><strong>Storage Location:</strong> ${
            item.storage_location_name || "Not specified"
          }</p>
        </div>

        <p><strong>Contact Information:</strong></p>
        <p>Email: ${claimer.email}</p>
        ${
          claimer.contact_number
            ? `<p>Phone: ${claimer.contact_number}</p>`
            : ""
        }

        <p>Please coordinate with them to return the item.</p>

        <p>Best regards,<br>Lost and Found Team</p>
      </div>
    `;

    return this.sendEmail({
      to: owner.email,
      subject: "Someone Claimed Your Found Item",
      html,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/reset-password?token=${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hi ${user.first_name},</p>
        <p>You requested to reset your password for your Lost and Found account.</p>
        
        <p>Click the button below to reset your password:</p>
        
        <p style="margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Reset Password
          </a>
        </p>

        <p>Or copy and paste this link into your browser:</p>
        <p style="background: #f5f5f5; padding: 10px; border-radius: 5px; word-break: break-all;">
          ${resetUrl}
        </p>

        <p><strong>This link will expire in 1 hour.</strong></p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          If you didn't request a password reset, please ignore this email or contact support if you have concerns.
        </p>

        <p>Best regards,<br>Lost and Found Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      html,
    });
  }

  /**
   * Send password reset confirmation email
   */
  async sendPasswordResetConfirmation(user) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Successful</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your password has been successfully reset.</p>
        
        <p>You can now log in with your new password.</p>

        <p>
          <a href="${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/login" 
             style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Go to Login
          </a>
        </p>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          If you didn't make this change, please contact support immediately.
        </p>

        <p>Best regards,<br>Lost and Found Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Password Reset Successful",
      html,
    });
  }

  /**
   * Send daily digest email
   */
  async sendDailyDigest(user, stats) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your Daily Lost & Found Summary</h2>
        <p>Hi ${user.first_name},</p>
        <p>Here's what happened today:</p>
        
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <p><strong>${stats.newMatches}</strong> new potential matches</p>
          <p><strong>${stats.newFoundItems}</strong> new items found</p>
          <p><strong>${stats.resolvedItems}</strong> items resolved</p>
        </div>

        ${
          stats.newMatches > 0
            ? `
          <p>
            <a href="${
              process.env.FRONTEND_URL || "http://localhost:3000"
            }/matches" 
               style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Matches
            </a>
          </p>
        `
            : ""
        }

        <p>Best regards,<br>Lost and Found Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Your Daily Lost & Found Summary",
      html,
    });
  }

  /**
   * Send claim approved email
   */
  async sendClaimApprovedEmail(user, itemTitle, pickupScheduled) {
    const pickupInfo = pickupScheduled
      ? `<p><strong>Pickup Scheduled:</strong> ${new Date(
          pickupScheduled
        ).toLocaleString()}</p>`
      : `<p>Please contact us to schedule your pickup.</p>`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Claim Approved!</h2>
        <p>Hi ${user.first_name},</p>
        <p>Great news! Your claim for <strong>"${itemTitle}"</strong> has been approved!</p>
        
        <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #4CAF50;">
          <h3 style="margin-top: 0; color: #2e7d32;">Next Steps</h3>
          ${pickupInfo}
          <p>Please bring a valid ID when picking up your item.</p>
        </div>

        <p>
          <a href="${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/claims" 
             style="background: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Claim Details
          </a>
        </p>

        <p>Best regards,<br>Lost and Found Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Your Claim Has Been Approved!",
      html,
    });
  }

  /**
   * Send claim rejected email
   */
  async sendClaimRejectedEmail(user, itemTitle, reason) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Claim Update</h2>
        <p>Hi ${user.first_name},</p>
        <p>We've reviewed your claim for <strong>"${itemTitle}"</strong>.</p>
        
        <div style="background: #ffebee; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #f44336;">
          <h3 style="margin-top: 0; color: #c62828;">Claim Not Approved</h3>
          <p><strong>Reason:</strong> ${reason}</p>
        </div>

        <p>If you believe this is an error, you can submit a new claim with additional proof of ownership.</p>

        <p>
          <a href="${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/found-items" 
             style="background: #2196F3; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Browse Found Items
          </a>
        </p>

        <p>Best regards,<br>Lost and Found Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Update on Your Claim",
      html,
    });
  }

  /**
   * Send pickup scheduled email
   */
  async sendPickupScheduledEmail(user, itemTitle, pickupDate) {
    const formattedDate = new Date(pickupDate).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Pickup Scheduled</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your pickup has been scheduled for your claimed item.</p>
        
        <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #2196F3;">
          <h3 style="margin-top: 0; color: #1565c0;">Pickup Details</h3>
          <p><strong>Item:</strong> ${itemTitle}</p>
          <p><strong>Date & Time:</strong> ${formattedDate}</p>
          <p><strong>Location:</strong> Lost and Found Office</p>
        </div>

        <div style="background: #fff3e0; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <p style="margin: 0;"><strong>Important:</strong> Please bring a valid ID when picking up your item.</p>
        </div>

        <p>
          <a href="${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/claims" 
             style="background: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Claim Details
          </a>
        </p>

        <p>Best regards,<br>Lost and Found Team</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Pickup Scheduled - " + itemTitle,
      html,
    });
  }

  /**
   * Strip HTML tags for plain text fallback
   */
  stripHtml(html) {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Test email configuration
   */
  async testConnection() {
    try {
      if (!this.apiKey) {
        console.error("MAILERSEND_API_KEY not configured");
        return false;
      }
      console.log("MailerSend API key configured");
      return true;
    } catch (error) {
      console.error("MailerSend connection failed:", error.message);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new EmailService();
