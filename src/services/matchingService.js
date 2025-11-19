/**
 * Intelligent Matching System
 * Automatically matches lost items with found items based on multiple criteria
 *
 * Matching Factors:
 * 1. Category match (exact)
 * 2. Location proximity (same location = high score)
 * 3. Date overlap (found date near lost date)
 * 4. Keyword similarity in title/description
 * 5. Unique identifiers match
 *
 * Match Score: 0-100
 * - 90-100: Excellent match (highly likely)
 * - 70-89: Good match (worth checking)
 * - 50-69: Possible match (might be)
 * - Below 50: Poor match (unlikely)
 */

const db = require("../config/database");

/**
 * Calculate similarity between two strings (Levenshtein distance based)
 * Returns score 0-1
 */
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  str1 = str1.toLowerCase().trim();
  str2 = str2.toLowerCase().trim();

  if (str1 === str2) return 1;

  // Simple word overlap scoring
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);

  let matchCount = 0;
  words1.forEach((word1) => {
    if (word1.length > 2) {
      // Ignore short words
      words2.forEach((word2) => {
        if (
          (word2.length > 2 && word1.includes(word2)) ||
          word2.includes(word1)
        ) {
          matchCount++;
        }
      });
    }
  });

  const totalWords = Math.max(words1.length, words2.length);
  return totalWords > 0 ? Math.min(matchCount / totalWords, 1) : 0;
}

/**
 * Calculate date proximity score
 * Returns score 0-1 based on how close the dates are
 */
function calculateDateProximity(lostDate, foundDate) {
  const lost = new Date(lostDate);
  const found = new Date(foundDate);

  // Found date should be on or after lost date
  if (found < lost) return 0;

  const daysDiff = Math.abs((found - lost) / (1000 * 60 * 60 * 24));

  // Perfect match: same day or next day
  if (daysDiff <= 1) return 1;
  if (daysDiff <= 3) return 0.9;
  if (daysDiff <= 7) return 0.7;
  if (daysDiff <= 14) return 0.5;
  if (daysDiff <= 30) return 0.3;

  return 0.1;
}

/**
 * Calculate match score between a lost item and found item
 */
function calculateMatchScore(lostItem, foundItem) {
  let score = 0;
  let weights = {
    category: 35, // Category match is critical
    location: 20, // Location proximity
    date: 15, // Date proximity
    title: 15, // Title similarity
    description: 10, // Description similarity
    identifiers: 5, // Unique identifiers
  };

  // 1. Category match (must match)
  if (lostItem.category_id === foundItem.category_id) {
    score += weights.category;
  } else {
    return 0; // Different categories = no match
  }

  // 2. Location match
  if (lostItem.last_seen_location_id && foundItem.found_location_id) {
    if (lostItem.last_seen_location_id === foundItem.found_location_id) {
      score += weights.location; // Same location
    } else {
      score += weights.location * 0.3; // Different location (still possible)
    }
  } else {
    score += weights.location * 0.5; // One location missing
  }

  // 3. Date proximity
  const dateScore = calculateDateProximity(
    lostItem.last_seen_date,
    foundItem.found_date
  );
  score += weights.date * dateScore;

  // 4. Title similarity
  const titleSimilarity = calculateStringSimilarity(
    lostItem.title,
    foundItem.title
  );
  score += weights.title * titleSimilarity;

  // 5. Description similarity
  const descSimilarity = calculateStringSimilarity(
    lostItem.description,
    foundItem.description
  );
  score += weights.description * descSimilarity;

  // 6. Unique identifiers match
  if (lostItem.unique_identifiers && foundItem.unique_identifiers) {
    const idSimilarity = calculateStringSimilarity(
      lostItem.unique_identifiers,
      foundItem.unique_identifiers
    );
    score += weights.identifiers * idSimilarity;
  }

  return Math.round(score);
}

/**
 * Get match confidence level
 */
function getMatchConfidence(score) {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "possible";
  return "poor";
}

/**
 * Find potential matches for a lost item
 */
async function findMatchesForLostItem(lostItemId) {
  // Get lost item details
  const lostItems = await db.query(
    `SELECT li.*, c.name as category_name, l.name as location_name
     FROM lost_items li
     LEFT JOIN categories c ON li.category_id = c.id
     LEFT JOIN locations l ON li.last_seen_location_id = l.id
     WHERE li.id = ? AND li.status = 'approved'`,
    [lostItemId]
  );

  if (lostItems.length === 0) {
    throw new Error("Lost item not found or not approved");
  }

  const lostItem = lostItems[0];

  // Get potential found items (same category, approved, not yet claimed)
  const foundItems = await db.query(
    `SELECT fi.*, c.name as category_name, l.name as location_name
     FROM found_items fi
     LEFT JOIN categories c ON fi.category_id = c.id
     LEFT JOIN locations l ON fi.found_location_id = l.id
     WHERE fi.category_id = ?
       AND fi.status = 'approved'
       AND fi.id NOT IN (
         SELECT found_item_id FROM claims WHERE status = 'approved'
       )
       AND fi.found_date >= DATE_SUB(?, INTERVAL 60 DAY)
     ORDER BY fi.found_date DESC`,
    [lostItem.category_id, lostItem.last_seen_date]
  );

  // Calculate match scores
  const matches = [];
  for (const foundItem of foundItems) {
    const score = calculateMatchScore(lostItem, foundItem);

    if (score >= 50) {
      // Only include reasonable matches
      matches.push({
        found_item_id: foundItem.id,
        found_item: {
          id: foundItem.id,
          title: foundItem.title,
          description: foundItem.description,
          category: foundItem.category_name,
          location: foundItem.location_name,
          found_date: foundItem.found_date,
          found_time: foundItem.found_time,
          storage_location_id: foundItem.storage_location_id,
          storage_notes: foundItem.storage_notes,
        },
        match_score: score,
        confidence: getMatchConfidence(score),
      });
    }
  }

  // Sort by score (highest first)
  matches.sort((a, b) => b.match_score - a.match_score);

  return matches;
}

/**
 * Find potential matches for a found item
 */
async function findMatchesForFoundItem(foundItemId) {
  // Get found item details
  const foundItems = await db.query(
    `SELECT fi.*, c.name as category_name, l.name as location_name
     FROM found_items fi
     LEFT JOIN categories c ON fi.category_id = c.id
     LEFT JOIN locations l ON fi.found_location_id = l.id
     WHERE fi.id = ? AND fi.status = 'approved'`,
    [foundItemId]
  );

  if (foundItems.length === 0) {
    throw new Error("Found item not found or not approved");
  }

  const foundItem = foundItems[0];

  // Get potential lost items (same category, approved, not yet resolved)
  const lostItems = await db.query(
    `SELECT li.*, c.name as category_name, l.name as location_name,
            CONCAT(u.first_name, ' ', u.last_name) as reporter_name,
            u.school_id, u.email
     FROM lost_items li
     LEFT JOIN categories c ON li.category_id = c.id
     LEFT JOIN locations l ON li.last_seen_location_id = l.id
     LEFT JOIN users u ON li.user_id = u.id
     WHERE li.category_id = ?
       AND li.status = 'approved'
       AND li.last_seen_date <= DATE_ADD(?, INTERVAL 7 DAY)
     ORDER BY li.last_seen_date DESC`,
    [foundItem.category_id, foundItem.found_date]
  );

  // Calculate match scores
  const matches = [];
  for (const lostItem of lostItems) {
    const score = calculateMatchScore(lostItem, foundItem);

    if (score >= 50) {
      matches.push({
        lost_item_id: lostItem.id,
        lost_item: {
          id: lostItem.id,
          title: lostItem.title,
          description: lostItem.description,
          category: lostItem.category_name,
          location: lostItem.location_name,
          last_seen_date: lostItem.last_seen_date,
          last_seen_time: lostItem.last_seen_time,
          reporter_name: lostItem.reporter_name,
          reporter_school_id: lostItem.school_id,
        },
        match_score: score,
        confidence: getMatchConfidence(score),
      });
    }
  }

  // Sort by score (highest first)
  matches.sort((a, b) => b.match_score - a.match_score);

  return matches;
}

/**
 * Save a match to the database
 */
async function saveMatch(lostItemId, foundItemId, matchScore, confidence) {
  const matchReason = `Match confidence: ${confidence} (${matchScore}% similarity)`;

  const result = await db.query(
    `INSERT INTO matches (lost_item_id, found_item_id, similarity_score, match_reason, status)
     VALUES (?, ?, ?, ?, 'suggested')
     ON DUPLICATE KEY UPDATE 
       similarity_score = VALUES(similarity_score),
       match_reason = VALUES(match_reason)`,
    [lostItemId, foundItemId, matchScore, matchReason]
  );

  return result;
}

/**
 * Run matching for all approved items
 * This can be run as a scheduled job
 */
async function runAutoMatching() {
  const results = {
    processed: 0,
    matches_found: 0,
    errors: 0,
  };

  try {
    // Get all approved lost items that don't have excellent matches yet
    const lostItems = await db.query(
      `SELECT id FROM lost_items 
       WHERE status = 'approved'
         AND id NOT IN (
           SELECT lost_item_id FROM matches 
           WHERE similarity_score >= 90 AND status != 'dismissed'
         )`
    );

    for (const lostItem of lostItems) {
      try {
        const matches = await findMatchesForLostItem(lostItem.id);
        results.processed++;

        // Save top 5 matches
        for (const match of matches.slice(0, 5)) {
          await saveMatch(
            lostItem.id,
            match.found_item_id,
            match.match_score,
            match.confidence
          );
          results.matches_found++;
        }
      } catch (error) {
        console.error(`Error matching lost item ${lostItem.id}:`, error);
        results.errors++;
      }
    }
  } catch (error) {
    console.error("Auto-matching error:", error);
    throw error;
  }

  return results;
}

module.exports = {
  findMatchesForLostItem,
  findMatchesForFoundItem,
  saveMatch,
  runAutoMatching,
  calculateMatchScore,
};
