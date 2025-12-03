/**
 * Health Routes
 * Provides detailed server health and status information
 */

const express = require("express");
const router = express.Router();
const os = require("os");
const { execSync } = require("child_process");
const db = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");

/**
 * Format bytes to human readable string
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/**
 * Format uptime to human readable string
 */
const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(" ");
};

/**
 * Get disk usage information
 * Works on both Windows and Linux
 */
const getDiskUsage = () => {
  try {
    const platform = os.platform();

    if (platform === "win32") {
      // Windows: Use wmic command
      const output = execSync("wmic logicaldisk get size,freespace,caption", {
        encoding: "utf8",
      });
      const lines = output.trim().split("\n").slice(1); // Skip header
      const disks = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[1] && parts[2]) {
          const caption = parts[0];
          const freeSpace = parseInt(parts[1]) || 0;
          const size = parseInt(parts[2]) || 0;
          if (size > 0) {
            disks.push({
              mount: caption,
              total: formatBytes(size),
              free: formatBytes(freeSpace),
              used: formatBytes(size - freeSpace),
              usedPercent: (((size - freeSpace) / size) * 100).toFixed(2) + "%",
            });
          }
        }
      }
      return disks.length > 0 ? disks : null;
    } else {
      // Linux/Unix: Use df command
      const output = execSync("df -B1 / /home 2>/dev/null || df -B1 /", {
        encoding: "utf8",
      });
      const lines = output.trim().split("\n").slice(1); // Skip header
      const disks = [];
      const seen = new Set();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          const mount = parts[5];
          if (seen.has(mount)) continue;
          seen.add(mount);

          const total = parseInt(parts[1]) || 0;
          const used = parseInt(parts[2]) || 0;
          const free = parseInt(parts[3]) || 0;

          if (total > 0) {
            disks.push({
              mount,
              total: formatBytes(total),
              free: formatBytes(free),
              used: formatBytes(used),
              usedPercent: ((used / total) * 100).toFixed(2) + "%",
            });
          }
        }
      }
      return disks.length > 0 ? disks : null;
    }
  } catch (error) {
    return { error: "Unable to retrieve disk information" };
  }
};

/**
 * Basic Health Check
 * GET /api/health
 * Public access - quick status check
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
});

/**
 * Detailed Health Report
 * GET /api/health/report
 * Admin access only - comprehensive system information
 */
router.get("/report", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const startTime = Date.now();

    // ============================================
    // SYSTEM INFORMATION
    // ============================================
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || "development",
    };

    // ============================================
    // MEMORY USAGE
    // ============================================
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const memory = {
      process: {
        heapTotal: formatBytes(memoryUsage.heapTotal),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        heapUsedPercent:
          ((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2) +
          "%",
        rss: formatBytes(memoryUsage.rss),
        external: formatBytes(memoryUsage.external),
        arrayBuffers: formatBytes(memoryUsage.arrayBuffers || 0),
      },
      system: {
        total: formatBytes(totalMemory),
        free: formatBytes(freeMemory),
        used: formatBytes(usedMemory),
        usedPercent: ((usedMemory / totalMemory) * 100).toFixed(2) + "%",
      },
    };

    // ============================================
    // CPU INFORMATION
    // ============================================
    const cpus = os.cpus();
    const cpuInfo = {
      model: cpus[0]?.model || "Unknown",
      cores: cpus.length,
      speed: cpus[0]?.speed + " MHz",
      loadAverage: os.loadavg().map((load) => load.toFixed(2)),
    };

    // ============================================
    // UPTIME
    // ============================================
    const uptime = {
      process: formatUptime(process.uptime()),
      processSeconds: Math.floor(process.uptime()),
      system: formatUptime(os.uptime()),
      systemSeconds: Math.floor(os.uptime()),
    };

    // ============================================
    // DISK USAGE
    // ============================================
    const disk = getDiskUsage();

    // ============================================
    // DATABASE STATUS
    // ============================================
    let databaseStatus = {
      status: "unknown",
      responseTime: null,
      version: null,
      connections: null,
      tables: null,
    };

    try {
      const dbStart = Date.now();

      // Test connection and get version
      const versionResult = await db.query("SELECT VERSION() as version");
      const dbResponseTime = Date.now() - dbStart;

      // Get connection info
      const processListResult = await db.query(
        'SHOW STATUS LIKE "Threads_connected"'
      );
      const maxConnectionsResult = await db.query(
        'SHOW VARIABLES LIKE "max_connections"'
      );

      // Get table counts
      const tableCountResult = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as users,
          (SELECT COUNT(*) FROM lost_items WHERE deleted_at IS NULL) as lost_items,
          (SELECT COUNT(*) FROM found_items WHERE deleted_at IS NULL) as found_items,
          (SELECT COUNT(*) FROM matches) as matches,
          (SELECT COUNT(*) FROM categories WHERE is_active = 1) as categories,
          (SELECT COUNT(*) FROM locations WHERE is_active = 1) as locations
      `);

      // Get recent activity
      const recentActivityResult = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND deleted_at IS NULL) as new_users_24h,
          (SELECT COUNT(*) FROM lost_items WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND deleted_at IS NULL) as lost_items_24h,
          (SELECT COUNT(*) FROM found_items WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND deleted_at IS NULL) as found_items_24h,
          (SELECT COUNT(*) FROM matches WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as matches_24h
      `);

      databaseStatus = {
        status: "connected",
        responseTime: dbResponseTime + "ms",
        version: versionResult[0]?.version || "Unknown",
        connections: {
          current: parseInt(processListResult[0]?.Value) || 0,
          max: parseInt(maxConnectionsResult[0]?.Value) || 0,
        },
        tables: tableCountResult[0],
        recentActivity: recentActivityResult[0],
      };
    } catch (dbError) {
      databaseStatus = {
        status: "error",
        error: dbError.message,
      };
    }

    // ============================================
    // API ENDPOINTS STATUS
    // ============================================
    const endpoints = {
      auth: "/api/auth",
      lostItems: "/api/lost-items",
      foundItems: "/api/found-items",
      categories: "/api/categories",
      locations: "/api/locations",
      matches: "/api/matches",
      search: "/api/search",
      health: "/api/health",
    };

    // ============================================
    // ENVIRONMENT CONFIGURATION (Safe subset)
    // ============================================
    const config = {
      port: process.env.PORT || 8080,
      nodeEnv: process.env.NODE_ENV || "development",
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",
      bcryptRounds: process.env.BCRYPT_ROUNDS || 12,
      rateLimitWindow: process.env.RATE_LIMIT_WINDOW || "15 minutes",
      rateLimitMax: process.env.RATE_LIMIT_MAX || 100,
      corsOrigin: process.env.CORS_ORIGIN || "*",
      emailConfigured: !!process.env.MAILERSEND_API_KEY,
      firebaseConfigured: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    };

    // ============================================
    // RESPONSE TIME
    // ============================================
    const reportGenerationTime = Date.now() - startTime;

    // ============================================
    // BUILD FINAL REPORT
    // ============================================
    const report = {
      success: true,
      generatedAt: new Date().toISOString(),
      reportGenerationTime: reportGenerationTime + "ms",

      status: {
        overall: databaseStatus.status === "connected" ? "healthy" : "degraded",
        api: "running",
        database: databaseStatus.status,
      },

      system: systemInfo,
      memory,
      cpu: cpuInfo,
      disk,
      uptime,
      database: databaseStatus,
      endpoints,
      config,

      // Summary metrics
      summary: {
        totalUsers: databaseStatus.tables?.users || 0,
        totalLostItems: databaseStatus.tables?.lost_items || 0,
        totalFoundItems: databaseStatus.tables?.found_items || 0,
        totalMatches: databaseStatus.tables?.matches || 0,
        newUsersLast24h: databaseStatus.recentActivity?.new_users_24h || 0,
        newLostItemsLast24h: databaseStatus.recentActivity?.lost_items_24h || 0,
        newFoundItemsLast24h:
          databaseStatus.recentActivity?.found_items_24h || 0,
        newMatchesLast24h: databaseStatus.recentActivity?.matches_24h || 0,
      },
    };

    res.json(report);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to generate health report",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * Quick Database Check
 * GET /api/health/db
 * Admin access only
 */
router.get("/db", authenticate, authorize(["admin"]), async (req, res) => {
  try {
    const startTime = Date.now();
    await db.query("SELECT 1");
    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      status: "connected",
      responseTime: responseTime + "ms",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: "disconnected",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Memory Usage
 * GET /api/health/memory
 * Admin access only
 */
router.get("/memory", authenticate, authorize(["admin"]), (req, res) => {
  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    process: {
      heapTotal: formatBytes(memoryUsage.heapTotal),
      heapUsed: formatBytes(memoryUsage.heapUsed),
      heapUsedPercent:
        ((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2) + "%",
      rss: formatBytes(memoryUsage.rss),
      external: formatBytes(memoryUsage.external),
    },
    system: {
      total: formatBytes(totalMemory),
      free: formatBytes(freeMemory),
      used: formatBytes(totalMemory - freeMemory),
      usedPercent:
        (((totalMemory - freeMemory) / totalMemory) * 100).toFixed(2) + "%",
    },
  });
});

/**
 * Live Statistics
 * GET /api/health/stats
 * Public access - real-time statistics for dashboard displays
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        -- User statistics
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as total_users,
        (SELECT COUNT(*) FROM users WHERE status = 'active' AND deleted_at IS NULL) as active_users,
        (SELECT COUNT(*) FROM users WHERE status = 'pending' AND deleted_at IS NULL) as pending_users,
        (SELECT COUNT(*) FROM users WHERE role = 'admin' AND deleted_at IS NULL) as admin_users,
        
        -- Item statistics
        (SELECT COUNT(*) FROM lost_items WHERE deleted_at IS NULL) as total_lost_items,
        (SELECT COUNT(*) FROM lost_items WHERE status = 'pending' AND deleted_at IS NULL) as pending_lost_items,
        (SELECT COUNT(*) FROM lost_items WHERE status = 'approved' AND deleted_at IS NULL) as approved_lost_items,
        (SELECT COUNT(*) FROM lost_items WHERE status = 'resolved' AND deleted_at IS NULL) as resolved_lost_items,
        
        (SELECT COUNT(*) FROM found_items WHERE deleted_at IS NULL) as total_found_items,
        (SELECT COUNT(*) FROM found_items WHERE status = 'pending' AND deleted_at IS NULL) as pending_found_items,
        (SELECT COUNT(*) FROM found_items WHERE status = 'approved' AND deleted_at IS NULL) as approved_found_items,
        (SELECT COUNT(*) FROM found_items WHERE status = 'claimed' AND deleted_at IS NULL) as claimed_found_items,
        
        -- Match statistics
        (SELECT COUNT(*) FROM matches) as total_matches,
        (SELECT COUNT(*) FROM matches WHERE status = 'pending') as pending_matches,
        (SELECT COUNT(*) FROM matches WHERE status = 'confirmed') as confirmed_matches,
        
        -- Category and location counts
        (SELECT COUNT(*) FROM categories WHERE is_active = 1) as total_categories,
        (SELECT COUNT(*) FROM locations WHERE is_active = 1) as total_locations
    `);

    // Get top categories
    const topCategories = await db.query(`
      SELECT 
        c.name,
        COUNT(DISTINCT li.id) as lost_count,
        COUNT(DISTINCT fi.id) as found_count
      FROM categories c
      LEFT JOIN lost_items li ON li.category_id = c.id AND li.deleted_at IS NULL
      LEFT JOIN found_items fi ON fi.category_id = c.id AND fi.deleted_at IS NULL
      WHERE c.is_active = 1
      GROUP BY c.id, c.name
      ORDER BY (COUNT(DISTINCT li.id) + COUNT(DISTINCT fi.id)) DESC
      LIMIT 5
    `);

    // Get top locations
    const topLocations = await db.query(`
      SELECT 
        l.name,
        COUNT(DISTINCT li.id) as lost_count,
        COUNT(DISTINCT fi.id) as found_count
      FROM locations l
      LEFT JOIN lost_items li ON li.last_seen_location_id = l.id AND li.deleted_at IS NULL
      LEFT JOIN found_items fi ON fi.found_location_id = l.id AND fi.deleted_at IS NULL
      WHERE l.is_active = 1
      GROUP BY l.id, l.name
      ORDER BY (COUNT(DISTINCT li.id) + COUNT(DISTINCT fi.id)) DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      statistics: stats[0],
      topCategories,
      topLocations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * Disk Usage
 * GET /api/health/disk
 * Admin access only
 */
router.get("/disk", authenticate, authorize(["admin"]), (req, res) => {
  const disk = getDiskUsage();

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    platform: os.platform(),
    disks: disk,
  });
});

module.exports = router;
