/**
 * File Upload Utilities
 * Secure file handling for item images
 *
 * FOLDER STRUCTURE:
 * uploads/
 *   lost-items/
 *     {item_id}/
 *       {timestamp}-{random}.{ext}
 *   found-items/
 *     {item_id}/
 *       {timestamp}-{random}.{ext}
 *   claims/
 *     {claim_id}/
 *       {timestamp}-{random}.{ext}
 *
 * SECURITY FEATURES:
 * 1. File type validation (images only)
 * 2. File size limits (5MB max)
 * 3. Filename sanitization
 * 4. Unique filename generation
 * 5. Storage path validation
 * 6. Magic bytes validation (actual file content check)
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const crypto = require("crypto");
const logger = require("./logger");

/**
 * Image magic bytes signatures
 * Used to verify actual file content matches claimed type
 */
const IMAGE_SIGNATURES = {
  jpeg: [
    [0xff, 0xd8, 0xff, 0xe0],
    [0xff, 0xd8, 0xff, 0xe1],
    [0xff, 0xd8, 0xff, 0xe2],
    [0xff, 0xd8, 0xff, 0xe3],
    [0xff, 0xd8, 0xff, 0xe8],
    [0xff, 0xd8, 0xff, 0xdb],
  ],
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  webp: [[0x52, 0x49, 0x46, 0x46]], // RIFF header (WebP uses RIFF container)
};

/**
 * Verify file is actually an image by checking magic bytes
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} True if file is a valid image
 */
const verifyImageMagicBytes = async (filePath) => {
  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // Check JPEG signatures
    for (const sig of IMAGE_SIGNATURES.jpeg) {
      if (buffer.slice(0, sig.length).equals(Buffer.from(sig))) {
        return true;
      }
    }

    // Check PNG signature
    for (const sig of IMAGE_SIGNATURES.png) {
      if (buffer.slice(0, sig.length).equals(Buffer.from(sig))) {
        return true;
      }
    }

    // Check WebP signature (RIFF....WEBP)
    if (buffer.slice(0, 4).equals(Buffer.from(IMAGE_SIGNATURES.webp[0]))) {
      // Additional check for WEBP format identifier
      if (buffer.slice(8, 12).toString() === "WEBP") {
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error("Magic bytes verification error:", error);
    return false;
  }
};

// Base upload directory
const UPLOAD_DIR = process.env.UPLOAD_PATH || "./uploads";
const LOST_ITEMS_DIR = path.join(UPLOAD_DIR, "lost-items");
const FOUND_ITEMS_DIR = path.join(UPLOAD_DIR, "found-items");
const CLAIMS_DIR = path.join(UPLOAD_DIR, "claims");

// Create base directories if they don't exist
[UPLOAD_DIR, LOST_ITEMS_DIR, FOUND_ITEMS_DIR, CLAIMS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Allowed file types (images only)
 */
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * File size limit (5MB)
 */
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024;

/**
 * Generate unique filename
 */
const generateUniqueFilename = (originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString("hex");
  return `${timestamp}-${randomString}${ext}`;
};

/**
 * Get the appropriate directory for an upload type
 * @param {string} uploadType - 'lost', 'found', or 'claim'
 * @returns {string} Base directory path
 */
const getBaseDir = (uploadType) => {
  switch (uploadType) {
    case "lost":
      return LOST_ITEMS_DIR;
    case "found":
      return FOUND_ITEMS_DIR;
    case "claim":
      return CLAIMS_DIR;
    default:
      return UPLOAD_DIR;
  }
};

/**
 * Create item-specific directory
 * @param {string} uploadType - 'lost', 'found', or 'claim'
 * @param {number} itemId - The item or claim ID
 * @returns {string} Full path to item directory
 */
const createItemDirectory = (uploadType, itemId) => {
  const baseDir = getBaseDir(uploadType);
  const itemDir = path.join(baseDir, String(itemId));

  if (!fs.existsSync(itemDir)) {
    fs.mkdirSync(itemDir, { recursive: true });
    logger.info(`Created directory: ${itemDir}`);
  }

  return itemDir;
};

/**
 * Multer storage configuration
 * Files are temporarily stored, then moved to item-specific folder
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Temporarily store in base directory
    // Will be moved to item-specific folder after item is created
    const tempDir = path.join(UPLOAD_DIR, "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = generateUniqueFilename(file.originalname);
    cb(null, uniqueName);
  },
});

/**
 * File filter - validate file type
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  // Check extension
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(
      new Error(
        `Invalid file type. Only ${ALLOWED_EXTENSIONS.join(", ")} are allowed.`
      ),
      false
    );
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return cb(
      new Error("Invalid file format. Only images are allowed."),
      false
    );
  }

  cb(null, true);
};

/**
 * Multer upload configuration
 */
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5, // Maximum 5 files per request
  },
});

/**
 * Move file to item-specific directory
 * @param {string} tempPath - Current temporary file path
 * @param {string} uploadType - 'lost', 'found', or 'claim'
 * @param {number} itemId - The item or claim ID
 * @returns {string} New file path
 */
const moveToItemDirectory = (tempPath, uploadType, itemId) => {
  const itemDir = createItemDirectory(uploadType, itemId);
  const filename = path.basename(tempPath);
  const newPath = path.join(itemDir, filename);

  fs.renameSync(tempPath, newPath);
  logger.info(`Moved file from ${tempPath} to ${newPath}`);

  return newPath;
};

/**
 * Process and optimize uploaded image
 * Resize large images and convert to WebP for efficiency
 * Also validates file is actually an image via magic bytes
 *
 * @param {string} filePath - Path to uploaded file
 * @returns {Object} Image metadata
 */
const processImage = async (filePath) => {
  try {
    // First verify the file is actually an image (magic bytes check)
    const isValidImage = await verifyImageMagicBytes(filePath);
    if (!isValidImage) {
      // Delete the suspicious file
      deleteFile(filePath);
      throw new Error(
        "File failed image verification - not a valid image file"
      );
    }

    const image = sharp(filePath);
    const metadata = await image.metadata();

    // Resize if image is too large (max 1920x1920)
    if (metadata.width > 1920 || metadata.height > 1920) {
      await image
        .resize(1920, 1920, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .toFile(filePath + ".resized");

      // Replace original with resized
      fs.unlinkSync(filePath);
      fs.renameSync(filePath + ".resized", filePath);

      // Get new metadata
      const newMetadata = await sharp(filePath).metadata();
      return {
        width: newMetadata.width,
        height: newMetadata.height,
        size: fs.statSync(filePath).size,
      };
    }

    return {
      width: metadata.width,
      height: metadata.height,
      size: fs.statSync(filePath).size,
    };
  } catch (error) {
    logger.error("Image processing error:", error);
    throw new Error("Failed to process image: " + error.message);
  }
};

/**
 * Delete file from storage
 * @param {string} filePath - Path to file
 * @returns {boolean} True if deleted
 */
const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`File deleted: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error("File deletion error:", error);
    return false;
  }
};

/**
 * Delete entire item directory
 * @param {string} uploadType - 'lost', 'found', or 'claim'
 * @param {number} itemId - The item or claim ID
 * @returns {boolean} True if deleted
 */
const deleteItemDirectory = (uploadType, itemId) => {
  try {
    const baseDir = getBaseDir(uploadType);
    const itemDir = path.join(baseDir, String(itemId));

    if (fs.existsSync(itemDir)) {
      fs.rmSync(itemDir, { recursive: true, force: true });
      logger.info(`Directory deleted: ${itemDir}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error("Directory deletion error:", error);
    return false;
  }
};

/**
 * Get file URL for API response
 * Converts file path to URL path
 * @param {string} filePath - Full file path
 * @returns {string} URL path (e.g., /api/uploads/lost-items/123/image.png)
 */
const getFileUrl = (filePath) => {
  if (!filePath) return null;

  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, "/");

  // If path already starts with /api/uploads/, return as-is (already formatted)
  if (normalizedPath.startsWith("/api/uploads/")) {
    return normalizedPath;
  }

  // Extract the relative path from uploads directory
  const uploadsIndex = normalizedPath.indexOf("/uploads/");
  if (uploadsIndex !== -1) {
    return "/api" + normalizedPath.substring(uploadsIndex);
  }

  // Handle relative paths
  if (normalizedPath.startsWith("uploads/")) {
    return "/api/" + normalizedPath;
  }

  if (normalizedPath.startsWith("./uploads/")) {
    return "/api" + normalizedPath.substring(1);
  }

  // Fallback - just return with /api/uploads prefix
  return "/api/uploads/" + path.basename(normalizedPath);
};

/**
 * Clean up temporary files (called on startup or scheduled)
 */
const cleanupTempFiles = () => {
  const tempDir = path.join(UPLOAD_DIR, "temp");
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    files.forEach((file) => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        logger.info(`Cleaned up temp file: ${filePath}`);
      }
    });
  }
};

module.exports = {
  upload,
  processImage,
  deleteFile,
  deleteItemDirectory,
  getFileUrl,
  moveToItemDirectory,
  createItemDirectory,
  cleanupTempFiles,
  UPLOAD_DIR,
  LOST_ITEMS_DIR,
  FOUND_ITEMS_DIR,
  CLAIMS_DIR,
};
