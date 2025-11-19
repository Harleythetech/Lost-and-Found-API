-- ============================================
-- Lost and Found Database Schema
-- MariaDB / MySQL Compatible
-- ============================================

-- Create database (if running this manually)
-- CREATE DATABASE IF NOT EXISTS lost_and_found_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE lost_and_found_db;

-- ============================================
-- Table: users
-- Stores user accounts with role-based access
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    school_id VARCHAR(20) UNIQUE NOT NULL COMMENT 'Format: 23-XXXX',
    email VARCHAR(255) UNIQUE NULL COMMENT 'Optional Gmail for Firebase auth',
    password_hash VARCHAR(255) NOT NULL COMMENT 'Bcrypt hashed password',
    
    -- User Information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NULL,
    
    -- Role-Based Access Control (RBAC)
    role ENUM('user', 'security', 'admin') DEFAULT 'user' NOT NULL,
    
    -- Account Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    is_email_verified BOOLEAN DEFAULT false,
    
    -- Security Fields
    failed_login_attempts INT DEFAULT 0,
    account_locked_until DATETIME NULL,
    last_login DATETIME NULL,
    last_password_change DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Two-Factor Authentication (2FA)
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(255) NULL COMMENT 'Encrypted TOTP secret',
    
    -- Firebase Integration (Optional)
    firebase_uid VARCHAR(255) UNIQUE NULL,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_school_id (school_id),
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: refresh_tokens
-- Stores JWT refresh tokens for session management
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(500) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_token (token(255)),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: categories
-- Item categories for classification
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT NULL,
    icon VARCHAR(50) NULL COMMENT 'Icon identifier for frontend',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default categories
INSERT INTO categories (name, description, icon) VALUES
('Electronics', 'Phones, laptops, tablets, chargers', 'smartphone'),
('Books', 'Textbooks, notebooks, documents', 'book'),
('IDs & Cards', 'School IDs, credit cards, access cards', 'credit-card'),
('Bags', 'Backpacks, purses, wallets', 'bag'),
('Clothing', 'Jackets, uniforms, accessories', 'shirt'),
('Keys', 'House keys, car keys, lockers', 'key'),
('Jewelry', 'Watches, rings, necklaces', 'watch'),
('Sports Equipment', 'Balls, rackets, gym items', 'sport'),
('Other', 'Miscellaneous items', 'other')
ON DUPLICATE KEY UPDATE name=name;

-- ============================================
-- Table: lost_items
-- Reports of lost items by users
-- ============================================
CREATE TABLE IF NOT EXISTS lost_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    category_id INT NOT NULL,
    
    -- Item Details
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    unique_features TEXT NULL COMMENT 'Unique identifiers for verification',
    
    -- Location & Time
    last_seen_location VARCHAR(255) NOT NULL,
    last_seen_date DATE NOT NULL,
    
    -- Status
    status ENUM('pending', 'approved', 'rejected', 'found', 'claimed', 'resolved') DEFAULT 'pending',
    approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    
    -- Moderation
    approved_by INT NULL COMMENT 'Admin user ID who approved',
    approved_at DATETIME NULL,
    rejection_reason TEXT NULL,
    
    -- Matching
    matched_found_item_id INT NULL COMMENT 'If system suggests a match',
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_status (status),
    INDEX idx_user_id (user_id),
    INDEX idx_category (category_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: found_items
-- Reports of found items by users/security
-- ============================================
CREATE TABLE IF NOT EXISTS found_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'User who found the item',
    category_id INT NOT NULL,
    
    -- Item Details
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    distinctive_marks TEXT NULL,
    
    -- Location & Storage
    found_location VARCHAR(255) NOT NULL,
    found_date DATE NOT NULL,
    storage_location VARCHAR(255) NULL COMMENT 'Where item is kept (Guardhouse, Office)',
    
    -- Status
    status ENUM('pending', 'approved', 'rejected', 'claimed', 'resolved') DEFAULT 'pending',
    approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    
    -- Moderation
    approved_by INT NULL,
    approved_at DATETIME NULL,
    rejection_reason TEXT NULL,
    verified_by INT NULL COMMENT 'Security personnel who verified',
    
    -- Matching
    matched_lost_item_id INT NULL,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_status (status),
    INDEX idx_user_id (user_id),
    INDEX idx_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: item_images
-- Images for lost/found items
-- ============================================
CREATE TABLE IF NOT EXISTS item_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_type ENUM('lost', 'found') NOT NULL,
    item_id INT NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_item (item_type, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: claims
-- Claim requests for found items
-- ============================================
CREATE TABLE IF NOT EXISTS claims (
    id INT AUTO_INCREMENT PRIMARY KEY,
    found_item_id INT NOT NULL,
    claimant_id INT NOT NULL,
    
    -- Claim Details
    description TEXT NOT NULL COMMENT 'How they lost it, proof of ownership',
    verification_details TEXT NULL,
    
    -- Status
    status ENUM('pending', 'approved', 'rejected', 'withdrawn') DEFAULT 'pending',
    
    -- Verification
    verified_by INT NULL COMMENT 'Admin/Security who verified',
    verified_at DATETIME NULL,
    rejection_reason TEXT NULL,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (found_item_id) REFERENCES found_items(id) ON DELETE CASCADE,
    FOREIGN KEY (claimant_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_found_item (found_item_id),
    INDEX idx_claimant (claimant_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: claim_images
-- Proof images for claims
-- ============================================
CREATE TABLE IF NOT EXISTS claim_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    claim_id INT NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
    INDEX idx_claim_id (claim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: notifications
-- User notifications
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL COMMENT 'approval, rejection, claim_request, match_found',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    related_type VARCHAR(50) NULL COMMENT 'lost_item, found_item, claim',
    related_id INT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: activity_logs
-- Audit trail for security and compliance
-- ============================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL COMMENT 'login, logout, post_create, claim_submit, etc',
    resource_type VARCHAR(50) NULL COMMENT 'user, lost_item, found_item, claim',
    resource_id INT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    details JSON NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Create default admin account
-- Password: Admin@123 (CHANGE THIS IMMEDIATELY!)
-- ============================================
-- Note: Password hash is for "Admin@123" - bcrypt with 12 rounds
INSERT INTO users (school_id, email, password_hash, first_name, last_name, role, is_active, is_verified)
VALUES (
    'ADMIN-001',
    'admin@lostandfound.edu',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIq0p3r0EK',
    'System',
    'Administrator',
    'admin',
    true,
    true
) ON DUPLICATE KEY UPDATE school_id=school_id;
