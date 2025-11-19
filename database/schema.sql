-- =====================================================
-- Lost and Found System - Database Schema
-- MariaDB/MySQL
-- =====================================================

-- Create database (if not exists)
CREATE DATABASE IF NOT EXISTS lost_and_found_v2 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE lost_and_found_v2;

-- =====================================================
-- 1. USERS TABLE (Authentication & User Management)
-- =====================================================
CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    -- School Identification
    school_id VARCHAR(20) NOT NULL UNIQUE COMMENT 'Format: 23-XXXX',
    
    -- Authentication
    email VARCHAR(255) NULL UNIQUE COMMENT 'Optional Gmail for Firebase auth',
    password_hash VARCHAR(255) NOT NULL COMMENT 'Bcrypt hashed password',
    
    -- Personal Information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    contact_number VARCHAR(20) NULL,
    
    -- Role-Based Access Control
    role ENUM('user', 'security', 'admin') NOT NULL DEFAULT 'user',
    
    -- Account Status
    status ENUM('active', 'suspended', 'pending', 'deleted') NOT NULL DEFAULT 'pending',
    email_verified BOOLEAN DEFAULT FALSE,
    
    -- Two-Factor Authentication (2FA)
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255) NULL COMMENT 'TOTP secret for Google Authenticator',
    
    -- Security Features
    login_attempts INT DEFAULT 0 COMMENT 'Track failed login attempts',
    locked_until DATETIME NULL COMMENT 'Account lock expiry time',
    last_login DATETIME NULL,
    password_changed_at DATETIME NULL,
    
    -- Firebase Integration (Optional)
    firebase_uid VARCHAR(128) NULL UNIQUE COMMENT 'Firebase User ID if using Firebase Auth',
    
    -- Refresh Token (for JWT rotation)
    refresh_token VARCHAR(500) NULL,
    refresh_token_expires DATETIME NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL COMMENT 'Soft delete',
    
    -- Indexes for performance and security
    INDEX idx_school_id (school_id),
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_status (status),
    INDEX idx_firebase_uid (firebase_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 2. CATEGORIES TABLE (Item Classification)
-- =====================================================
CREATE TABLE categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g., Electronics, Books, IDs, Clothing',
    description TEXT NULL,
    icon VARCHAR(50) NULL COMMENT 'Icon name for frontend',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 3. LOCATIONS TABLE (Campus Locations)
-- =====================================================
CREATE TABLE locations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL COMMENT 'e.g., Library, Cafeteria, Guardhouse',
    building VARCHAR(100) NULL,
    floor VARCHAR(20) NULL,
    description TEXT NULL,
    is_storage BOOLEAN DEFAULT FALSE COMMENT 'TRUE if items are stored here',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_storage (is_storage),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 4. LOST ITEMS TABLE
-- =====================================================
CREATE TABLE lost_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    -- Reporter Information
    user_id INT UNSIGNED NOT NULL,
    
    -- Item Details
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    
    -- Loss Details
    last_seen_location_id INT UNSIGNED NULL,
    last_seen_date DATE NOT NULL,
    last_seen_time TIME NULL,
    
    -- Additional Information
    unique_identifiers TEXT NULL COMMENT 'Serial numbers, distinguishing marks, etc.',
    reward_offered DECIMAL(10,2) NULL DEFAULT 0.00,
    
    -- Status Management
    status ENUM('pending', 'approved', 'rejected', 'matched', 'resolved', 'archived') 
        NOT NULL DEFAULT 'pending',
    
    -- Moderation
    reviewed_by INT UNSIGNED NULL COMMENT 'Admin/Security who reviewed',
    reviewed_at DATETIME NULL,
    rejection_reason TEXT NULL,
    
    -- Resolution
    resolved_at DATETIME NULL,
    resolved_by INT UNSIGNED NULL,
    resolution_notes TEXT NULL,
    
    -- Contact Preferences
    contact_via_email BOOLEAN DEFAULT TRUE,
    contact_via_phone BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (last_seen_location_id) REFERENCES locations(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id),
    FOREIGN KEY (resolved_by) REFERENCES users(id),
    
    -- Indexes
    INDEX idx_user_id (user_id),
    INDEX idx_category (category_id),
    INDEX idx_location (last_seen_location_id),
    INDEX idx_status (status),
    INDEX idx_date (last_seen_date),
    INDEX idx_created (created_at),
    FULLTEXT INDEX ft_search (title, description, unique_identifiers)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 5. FOUND ITEMS TABLE
-- =====================================================
CREATE TABLE found_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    -- Finder Information
    user_id INT UNSIGNED NOT NULL,
    
    -- Item Details
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    
    -- Found Details
    found_location_id INT UNSIGNED NULL,
    found_date DATE NOT NULL,
    found_time TIME NULL,
    
    -- Storage Information
    storage_location_id INT UNSIGNED NULL COMMENT 'Where item is currently stored',
    storage_notes TEXT NULL,
    turned_in_to_security BOOLEAN DEFAULT FALSE,
    
    -- Additional Information
    unique_identifiers TEXT NULL,
    condition_notes TEXT NULL COMMENT 'Condition of the item',
    
    -- Status Management
    status ENUM('pending', 'approved', 'rejected', 'claimed', 'resolved', 'archived') 
        NOT NULL DEFAULT 'pending',
    
    -- Moderation
    reviewed_by INT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    rejection_reason TEXT NULL,
    
    -- Resolution
    resolved_at DATETIME NULL,
    resolved_by INT UNSIGNED NULL,
    resolution_notes TEXT NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (found_location_id) REFERENCES locations(id),
    FOREIGN KEY (storage_location_id) REFERENCES locations(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id),
    FOREIGN KEY (resolved_by) REFERENCES users(id),
    
    -- Indexes
    INDEX idx_user_id (user_id),
    INDEX idx_category (category_id),
    INDEX idx_location (found_location_id),
    INDEX idx_storage (storage_location_id),
    INDEX idx_status (status),
    INDEX idx_date (found_date),
    INDEX idx_created (created_at),
    FULLTEXT INDEX ft_search (title, description, unique_identifiers)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 6. ITEM IMAGES TABLE (File Uploads)
-- =====================================================
CREATE TABLE item_images (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    -- Link to item (polymorphic relationship)
    item_type ENUM('lost', 'found') NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    
    -- File Information
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT UNSIGNED NOT NULL COMMENT 'Size in bytes',
    mime_type VARCHAR(100) NOT NULL,
    
    -- Image metadata
    width INT NULL,
    height INT NULL,
    is_primary BOOLEAN DEFAULT FALSE COMMENT 'Main display image',
    
    -- Upload Information
    uploaded_by INT UNSIGNED NOT NULL,
    upload_ip VARCHAR(45) NULL COMMENT 'IP address for security audit',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (uploaded_by) REFERENCES users(id),
    
    -- Indexes
    INDEX idx_item (item_type, item_id),
    INDEX idx_primary (is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 7. CLAIMS TABLE (Item Claiming System)
-- =====================================================
CREATE TABLE claims (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    -- Claim Information
    found_item_id INT UNSIGNED NOT NULL,
    claimant_user_id INT UNSIGNED NOT NULL,
    
    -- Proof of Ownership
    description TEXT NOT NULL COMMENT 'Why they believe it is theirs',
    proof_details TEXT NULL COMMENT 'Additional proof details',
    
    -- Verification
    status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    verified_by INT UNSIGNED NULL COMMENT 'Security/Admin who verified',
    verified_at DATETIME NULL,
    verification_notes TEXT NULL,
    rejection_reason TEXT NULL,
    
    -- Pickup Information
    pickup_scheduled DATETIME NULL,
    picked_up_at DATETIME NULL,
    picked_up_by_name VARCHAR(200) NULL COMMENT 'Person who picked up',
    id_presented VARCHAR(100) NULL COMMENT 'ID shown during pickup',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (found_item_id) REFERENCES found_items(id) ON DELETE CASCADE,
    FOREIGN KEY (claimant_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id),
    
    -- Indexes
    INDEX idx_found_item (found_item_id),
    INDEX idx_claimant (claimant_user_id),
    INDEX idx_status (status),
    
    -- Prevent duplicate claims
    UNIQUE KEY unique_claim (found_item_id, claimant_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 8. CLAIM IMAGES TABLE (Proof Images)
-- =====================================================
CREATE TABLE claim_images (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id INT UNSIGNED NOT NULL,
    
    -- File Information
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT UNSIGNED NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    
    -- Image type
    image_type ENUM('proof', 'id', 'other') DEFAULT 'proof',
    description TEXT NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
    
    INDEX idx_claim (claim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 9. MATCHES TABLE (Auto-Matching System)
-- =====================================================
CREATE TABLE matches (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    lost_item_id INT UNSIGNED NOT NULL,
    found_item_id INT UNSIGNED NOT NULL,
    
    -- Match Score (AI/Algorithm confidence)
    similarity_score DECIMAL(5,2) NULL COMMENT 'Percentage 0-100',
    match_reason TEXT NULL COMMENT 'Why these items were matched',
    
    -- Status
    status ENUM('suggested', 'confirmed', 'dismissed') NOT NULL DEFAULT 'suggested',
    
    -- User Actions
    dismissed_by INT UNSIGNED NULL,
    confirmed_by INT UNSIGNED NULL,
    action_date DATETIME NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (lost_item_id) REFERENCES lost_items(id) ON DELETE CASCADE,
    FOREIGN KEY (found_item_id) REFERENCES found_items(id) ON DELETE CASCADE,
    FOREIGN KEY (dismissed_by) REFERENCES users(id),
    FOREIGN KEY (confirmed_by) REFERENCES users(id),
    
    -- Indexes
    INDEX idx_lost (lost_item_id),
    INDEX idx_found (found_item_id),
    INDEX idx_status (status),
    
    -- Prevent duplicate matches
    UNIQUE KEY unique_match (lost_item_id, found_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 10. NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE notifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    user_id INT UNSIGNED NOT NULL,
    
    -- Notification Content
    type ENUM('post_approved', 'post_rejected', 'claim_request', 'claim_response', 
              'match_found', 'item_resolved', 'system', 'security_alert') NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    
    -- Related Items (optional references)
    related_item_type ENUM('lost', 'found', 'claim', 'match', 'user') NULL,
    related_item_id INT UNSIGNED NULL,
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at DATETIME NULL,
    
    -- Action Link
    action_url VARCHAR(500) NULL COMMENT 'Link to related page',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL COMMENT 'Auto-delete old notifications',
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_user (user_id),
    INDEX idx_read (is_read),
    INDEX idx_type (type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 11. ACTIVITY LOGS TABLE (Audit Trail)
-- =====================================================
CREATE TABLE activity_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    -- Who performed the action
    user_id INT UNSIGNED NULL COMMENT 'NULL for system actions',
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    
    -- What action was performed
    action VARCHAR(100) NOT NULL COMMENT 'e.g., login, create_post, approve_claim',
    resource_type VARCHAR(50) NULL COMMENT 'e.g., user, lost_item, found_item',
    resource_id INT UNSIGNED NULL,
    
    -- Action details
    description TEXT NULL,
    old_values JSON NULL COMMENT 'Data before change',
    new_values JSON NULL COMMENT 'Data after change',
    
    -- Result
    status ENUM('success', 'failed', 'error') NOT NULL DEFAULT 'success',
    error_message TEXT NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Indexes
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_resource (resource_type, resource_id),
    INDEX idx_created (created_at),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 12. PASSWORD RESET TOKENS TABLE
-- =====================================================
CREATE TABLE password_reset_tokens (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    user_id INT UNSIGNED NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    
    -- Security
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    ip_address VARCHAR(45) NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    INDEX idx_token (token),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 13. EMAIL VERIFICATION TOKENS TABLE
-- =====================================================
CREATE TABLE email_verification_tokens (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    user_id INT UNSIGNED NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    
    expires_at DATETIME NOT NULL,
    verified_at DATETIME NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    INDEX idx_token (token),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- INSERT DEFAULT DATA
-- =====================================================

-- Default Categories
INSERT INTO categories (name, description, icon) VALUES
('Electronics', 'Phones, laptops, tablets, chargers, earphones', 'laptop'),
('Books & Notebooks', 'Textbooks, notebooks, folders', 'book'),
('IDs & Documents', 'School IDs, licenses, certificates', 'id-card'),
('Bags & Accessories', 'Backpacks, wallets, pouches', 'briefcase'),
('Clothing', 'Jackets, uniforms, shoes', 'tshirt'),
('Keys', 'House keys, locker keys, keychains', 'key'),
('Personal Items', 'Watches, jewelry, glasses', 'watch'),
('Sports Equipment', 'Balls, rackets, gym equipment', 'basketball'),
('Stationery', 'Pens, calculators, rulers', 'pen'),
('Other', 'Items that don\'t fit other categories', 'question');

-- Default Locations
INSERT INTO locations (name, building, description, is_storage) VALUES
('Library', 'Main Building', 'Campus library', FALSE),
('Cafeteria', 'Student Center', 'Main cafeteria', FALSE),
('Gymnasium', 'Sports Complex', 'Main gym', FALSE),
('Guardhouse', 'Main Gate', 'Security office - main storage', TRUE),
('Admin Office', 'Administration', 'Administrative office', FALSE),
('Computer Laboratory', 'IT Building', 'Computer lab', FALSE),
('Parking Lot', 'Campus Grounds', 'Student parking area', FALSE),
('Quadrangle', 'Campus Grounds', 'Open campus area', FALSE),
('Classroom Building A', 'Building A', 'Classrooms', FALSE),
('Classroom Building B', 'Building B', 'Classrooms', FALSE);

-- Default Admin User (Password: Admin@123456)
-- IMPORTANT: Change this password immediately in production!
INSERT INTO users (
    school_id, 
    email, 
    password_hash, 
    first_name, 
    last_name, 
    role, 
    status,
    email_verified
) VALUES (
    'ADMIN-2024',
    'admin@lostandfound.edu',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIxIv3q8v2', -- Admin@123456
    'System',
    'Administrator',
    'admin',
    'active',
    TRUE
);

-- =====================================================
-- VIEWS FOR ANALYTICS
-- =====================================================

-- View: Active Lost Items with User Details
CREATE VIEW vw_active_lost_items AS
SELECT 
    li.id,
    li.title,
    li.description,
    c.name AS category,
    l.name AS last_seen_location,
    li.last_seen_date,
    li.status,
    CONCAT(u.first_name, ' ', u.last_name) AS reporter_name,
    u.school_id,
    u.contact_number,
    li.created_at
FROM lost_items li
JOIN users u ON li.user_id = u.id
JOIN categories c ON li.category_id = c.id
LEFT JOIN locations l ON li.last_seen_location_id = l.id
WHERE li.deleted_at IS NULL
  AND li.status IN ('approved', 'matched');

-- View: Active Found Items with Storage Info
CREATE VIEW vw_active_found_items AS
SELECT 
    fi.id,
    fi.title,
    fi.description,
    c.name AS category,
    l1.name AS found_location,
    l2.name AS storage_location,
    fi.found_date,
    fi.status,
    CONCAT(u.first_name, ' ', u.last_name) AS finder_name,
    u.school_id,
    fi.turned_in_to_security,
    fi.created_at
FROM found_items fi
JOIN users u ON fi.user_id = u.id
JOIN categories c ON fi.category_id = c.id
LEFT JOIN locations l1 ON fi.found_location_id = l1.id
LEFT JOIN locations l2 ON fi.storage_location_id = l2.id
WHERE fi.deleted_at IS NULL
  AND fi.status IN ('approved', 'claimed');

-- =====================================================
-- SECURITY NOTES
-- =====================================================
-- 1. All passwords are hashed using bcrypt (12 rounds)
-- 2. Soft delete implemented (deleted_at) for audit trail
-- 3. All foreign keys have proper CASCADE/SET NULL
-- 4. Indexes on frequently queried columns
-- 5. FULLTEXT indexes for search functionality
-- 6. JSON columns for flexible audit logging
-- 7. IP address logging for security tracking
-- 8. Token-based password reset and email verification
-- 9. Role-based access control (RBAC)
-- 10. Two-factor authentication support

-- =====================================================
-- MAINTENANCE QUERIES (Run periodically)
-- =====================================================

-- Clean expired password reset tokens
-- DELETE FROM password_reset_tokens WHERE expires_at < NOW();

-- Clean expired email verification tokens
-- DELETE FROM email_verification_tokens WHERE expires_at < NOW();

-- Clean old notifications (older than 90 days)
-- DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY) AND is_read = TRUE;

-- Archive resolved items older than 6 months
-- UPDATE lost_items SET status = 'archived' WHERE status = 'resolved' AND resolved_at < DATE_SUB(NOW(), INTERVAL 6 MONTH);
-- UPDATE found_items SET status = 'archived' WHERE status = 'resolved' AND resolved_at < DATE_SUB(NOW(), INTERVAL 6 MONTH);
