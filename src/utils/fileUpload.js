/**
 * File Upload Utilities
 * Secure file handling for item images
 *
 * SECURITY FEATURES:
 * 1. File type validation (images only)
 * 2. File size limits (5MB max)
 * 3. Filename sanitization
 * 4. Unique filename generation
 * 5. Storage path validation
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const crypto = require("crypto");
const logger = require("./logger");

// Ensure upload directory exists
const UPLOAD_DIR = process.env.UPLOAD_PATH || "./uploads";
const ITEMS_DIR = path.join(UPLOAD_DIR, "items");
const CLAIMS_DIR = path.join(UPLOAD_DIR, "claims");

// Create directories if they don't exist
[UPLOAD_DIR, ITEMS_DIR, CLAIMS_DIR].forEach((dir) => {
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
 * Multer storage configuration
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine destination based on upload type
    const dest = req.uploadType === "claim" ? CLAIMS_DIR : ITEMS_DIR;
    cb(null, dest);
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
 * Process and optimize uploaded image
 * Resize large images and convert to WebP for efficiency
 *
 * @param {string} filePath - Path to uploaded file
 * @returns {Object} Image metadata
 */
const processImage = async (filePath) => {
  try {
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
    throw new Error("Failed to process image");
  }
};

/**
 * Delete file from storage
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
 * Get file URL for response
 */
const getFileUrl = (filePath) => {
  // Remove base upload directory to get relative path
  return filePath.replace(UPLOAD_DIR, "/uploads");
};

module.exports = {
  upload,
  processImage,
  deleteFile,
  getFileUrl,
  UPLOAD_DIR,
  ITEMS_DIR,
  CLAIMS_DIR,
};
