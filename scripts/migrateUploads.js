/**
 * Migration Script: Reorganize Uploads Folder Structure
 *
 * OLD STRUCTURE:
 *   uploads/items/     - All item images (lost & found)
 *   uploads/claims/    - All claim proof images
 *
 * NEW STRUCTURE:
 *   uploads/lost-items/{item_id}/   - Lost item images
 *   uploads/found-items/{item_id}/  - Found item images
 *   uploads/claims/{claim_id}/      - Claim proof images
 *
 * USAGE:
 *   node scripts/migrateUploads.js [--dry-run]
 *
 * Options:
 *   --dry-run   Preview changes without actually moving files
 */

const fs = require("fs").promises;
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

// Configuration
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const OLD_ITEMS_DIR = path.join(UPLOADS_DIR, "items");
const OLD_CLAIMS_DIR = path.join(UPLOADS_DIR, "claims");
const NEW_LOST_ITEMS_DIR = path.join(UPLOADS_DIR, "lost-items");
const NEW_FOUND_ITEMS_DIR = path.join(UPLOADS_DIR, "found-items");
const NEW_CLAIMS_DIR = path.join(UPLOADS_DIR, "claims");

const isDryRun = process.argv.includes("--dry-run");

let connection;
let stats = {
  lostItems: { found: 0, moved: 0, errors: 0 },
  foundItems: { found: 0, moved: 0, errors: 0 },
  claims: { found: 0, moved: 0, errors: 0 },
  databaseUpdates: 0,
};

async function log(message, type = "info") {
  const prefix = isDryRun ? "[DRY-RUN] " : "";
  const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };
  console.log(`${icons[type] || ""} ${prefix}${message}`);
}

async function ensureDirectory(dir) {
  try {
    await fs.access(dir);
  } catch {
    if (!isDryRun) {
      await fs.mkdir(dir, { recursive: true });
    }
    log(`Created directory: ${dir}`, "success");
  }
}

async function moveFile(oldPath, newPath) {
  try {
    // Check if source exists
    await fs.access(oldPath);

    if (isDryRun) {
      log(`Would move: ${oldPath} → ${newPath}`);
      return true;
    }

    // Create target directory
    const targetDir = path.dirname(newPath);
    await fs.mkdir(targetDir, { recursive: true });

    // Move the file
    await fs.rename(oldPath, newPath);
    log(`Moved: ${path.basename(oldPath)} → ${newPath}`, "success");
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      log(`File not found (skipping): ${oldPath}`, "warning");
    } else {
      log(`Error moving ${oldPath}: ${error.message}`, "error");
    }
    return false;
  }
}

async function connectDatabase() {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });
  log("Connected to database");
}

async function migrateItemImages() {
  log("\n📸 Migrating Item Images...");

  // Get all item images from database
  const [images] = await connection.execute(
    `SELECT ii.id, ii.item_type, ii.item_id, ii.file_path, ii.file_name
     FROM item_images ii
     WHERE ii.file_path IS NOT NULL`
  );

  log(`Found ${images.length} item images in database`);

  for (const image of images) {
    const { id, item_type, item_id, file_path, file_name } = image;

    // Determine old and new paths
    const oldPath = path.isAbsolute(file_path)
      ? file_path
      : path.join(UPLOADS_DIR, file_path.replace(/^uploads[\\/]/, ""));

    const targetDir =
      item_type === "lost" ? NEW_LOST_ITEMS_DIR : NEW_FOUND_ITEMS_DIR;
    const newPath = path.join(targetDir, String(item_id), file_name);
    const newRelativePath = path.join(
      "uploads",
      item_type === "lost" ? "lost-items" : "found-items",
      String(item_id),
      file_name
    );

    if (item_type === "lost") {
      stats.lostItems.found++;
    } else {
      stats.foundItems.found++;
    }

    // Check if already migrated
    if (
      file_path.includes(
        `${item_type === "lost" ? "lost-items" : "found-items"}/${item_id}/`
      )
    ) {
      log(`Already migrated: ${file_path}`, "info");
      continue;
    }

    // Move file
    const moved = await moveFile(oldPath, newPath);

    if (moved) {
      if (item_type === "lost") {
        stats.lostItems.moved++;
      } else {
        stats.foundItems.moved++;
      }

      // Update database
      if (!isDryRun) {
        await connection.execute(
          `UPDATE item_images SET file_path = ? WHERE id = ?`,
          [newRelativePath, id]
        );
        stats.databaseUpdates++;
      }
    } else {
      if (item_type === "lost") {
        stats.lostItems.errors++;
      } else {
        stats.foundItems.errors++;
      }
    }
  }
}

async function migrateClaimImages() {
  log("\n📎 Migrating Claim Images...");

  // Get all claim images from database
  const [images] = await connection.execute(
    `SELECT ci.id, ci.claim_id, ci.file_path, ci.file_name
     FROM claim_images ci
     WHERE ci.file_path IS NOT NULL`
  );

  log(`Found ${images.length} claim images in database`);

  for (const image of images) {
    const { id, claim_id, file_path, file_name } = image;

    stats.claims.found++;

    // Determine old and new paths
    const oldPath = path.isAbsolute(file_path)
      ? file_path
      : path.join(UPLOADS_DIR, file_path.replace(/^uploads[\\/]/, ""));

    const newPath = path.join(NEW_CLAIMS_DIR, String(claim_id), file_name);
    const newRelativePath = path.join(
      "uploads",
      "claims",
      String(claim_id),
      file_name
    );

    // Check if already migrated (path contains claims/{id}/)
    if (file_path.match(/claims[\\/]\d+[\\/]/)) {
      log(`Already migrated: ${file_path}`, "info");
      continue;
    }

    // Move file
    const moved = await moveFile(oldPath, newPath);

    if (moved) {
      stats.claims.moved++;

      // Update database
      if (!isDryRun) {
        await connection.execute(
          `UPDATE claim_images SET file_path = ? WHERE id = ?`,
          [newRelativePath, id]
        );
        stats.databaseUpdates++;
      }
    } else {
      stats.claims.errors++;
    }
  }
}

async function cleanupEmptyDirectories() {
  log("\n🧹 Cleaning up empty directories...");

  const dirsToCheck = [OLD_ITEMS_DIR, OLD_CLAIMS_DIR];

  for (const dir of dirsToCheck) {
    try {
      const files = await fs.readdir(dir);
      if (files.length === 0) {
        if (!isDryRun) {
          await fs.rmdir(dir);
        }
        log(`Removed empty directory: ${dir}`, "success");
      } else {
        log(
          `Directory not empty (${files.length} files remaining): ${dir}`,
          "warning"
        );
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        log(`Error checking directory ${dir}: ${error.message}`, "error");
      }
    }
  }
}

async function printSummary() {
  console.log("\n" + "=".repeat(50));
  console.log("📊 MIGRATION SUMMARY");
  console.log("=".repeat(50));

  if (isDryRun) {
    console.log("🔍 DRY RUN - No changes were made\n");
  }

  console.log(`Lost Items:`);
  console.log(`  - Found: ${stats.lostItems.found}`);
  console.log(`  - Moved: ${stats.lostItems.moved}`);
  console.log(`  - Errors: ${stats.lostItems.errors}`);

  console.log(`\nFound Items:`);
  console.log(`  - Found: ${stats.foundItems.found}`);
  console.log(`  - Moved: ${stats.foundItems.moved}`);
  console.log(`  - Errors: ${stats.foundItems.errors}`);

  console.log(`\nClaims:`);
  console.log(`  - Found: ${stats.claims.found}`);
  console.log(`  - Moved: ${stats.claims.moved}`);
  console.log(`  - Errors: ${stats.claims.errors}`);

  console.log(`\nDatabase Updates: ${stats.databaseUpdates}`);
  console.log("=".repeat(50));

  const totalErrors =
    stats.lostItems.errors + stats.foundItems.errors + stats.claims.errors;
  if (totalErrors > 0) {
    console.log(
      `\n⚠️  ${totalErrors} files could not be migrated. Check logs above.`
    );
  } else {
    console.log(`\n✅ Migration completed successfully!`);
  }
}

async function main() {
  console.log("=".repeat(50));
  console.log("🚀 Uploads Migration Script");
  console.log("=".repeat(50));

  if (isDryRun) {
    console.log("🔍 Running in DRY-RUN mode - no files will be moved\n");
  }

  try {
    await connectDatabase();

    // Create new directories
    await ensureDirectory(NEW_LOST_ITEMS_DIR);
    await ensureDirectory(NEW_FOUND_ITEMS_DIR);
    await ensureDirectory(NEW_CLAIMS_DIR);

    // Migrate files
    await migrateItemImages();
    await migrateClaimImages();

    // Cleanup
    if (!isDryRun) {
      await cleanupEmptyDirectories();
    }

    await printSummary();
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      log("\nDatabase connection closed");
    }
  }
}

main();
