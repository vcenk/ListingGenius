/**
 * Usage Tracking with Firestore
 * ListingGenius Backend
 *
 * Tracks API usage per user for billing and limits
 */

import { getDb, COLLECTIONS, getCurrentMonthKey, getNextResetDate } from './firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Get usage document reference for a user
 * @param {string} userId - User ID
 * @returns {DocumentReference}
 */
function getUsageRef(userId) {
  const db = getDb();
  const monthKey = getCurrentMonthKey();
  return db.collection(COLLECTIONS.USAGE).doc(`${userId}_${monthKey}`);
}

/**
 * Get usage for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Usage data
 */
export async function getUsage(userId) {
  const monthKey = getCurrentMonthKey();
  const usageRef = getUsageRef(userId);

  try {
    const doc = await usageRef.get();

    if (!doc.exists) {
      return {
        userId,
        month: monthKey,
        listings: 0,
        keywords: 0,
        imageCredits: 0,
        apiCalls: 0,
        resetDate: getNextResetDate()
      };
    }

    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error getting usage:', error);
    return {
      userId,
      month: monthKey,
      listings: 0,
      keywords: 0,
      imageCredits: 0,
      apiCalls: 0
    };
  }
}

/**
 * Increment usage for a user
 * @param {string} userId - User ID
 * @param {string} metric - Metric to increment
 * @param {number} amount - Amount to increment by
 * @returns {Promise<Object>} - Updated usage
 */
export async function incrementUsage(userId, metric, amount = 1) {
  const monthKey = getCurrentMonthKey();
  const usageRef = getUsageRef(userId);

  try {
    const updateData = {
      userId,
      month: monthKey,
      [metric]: FieldValue.increment(amount),
      lastUpdated: new Date().toISOString()
    };

    await usageRef.set(updateData, { merge: true });

    // Return updated usage
    return await getUsage(userId);
  } catch (error) {
    console.error('Error incrementing usage:', error);
    throw error;
  }
}

/**
 * Track an API call
 * @param {string} userId - User ID
 * @param {string} endpoint - API endpoint called
 * @param {Object} metadata - Additional metadata
 */
export async function trackApiCall(userId, endpoint, metadata = {}) {
  try {
    await incrementUsage(userId, 'apiCalls', 1);

    // Track specific metrics based on endpoint
    if (endpoint.includes('listing') || endpoint.includes('generate')) {
      await incrementUsage(userId, 'listings', 1);
    } else if (endpoint.includes('keyword')) {
      await incrementUsage(userId, 'keywords', 1);
    } else if (endpoint.includes('image') || endpoint.includes('fal')) {
      await incrementUsage(userId, 'imageCredits', metadata.credits || 1);
    }

    // Optionally log to a separate collection for detailed analytics
    if (process.env.ENABLE_ANALYTICS === 'true') {
      const db = getDb();
      await db.collection('apiLogs').add({
        userId,
        endpoint,
        metadata,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error tracking API call:', error);
    // Don't throw - tracking should not break the API call
  }
}

/**
 * Get usage summary for a user
 * @param {string} userId - User ID
 * @param {Object} limits - Plan limits
 * @returns {Promise<Object>} - Usage summary with percentages
 */
export async function getUsageSummary(userId, limits) {
  const usage = await getUsage(userId);

  const summary = {
    month: usage.month,
    listings: {
      used: usage.listings || 0,
      limit: limits.listingsPerMonth,
      percentage: limits.listingsPerMonth === -1 ? 0 :
        Math.round(((usage.listings || 0) / limits.listingsPerMonth) * 100)
    },
    keywords: {
      used: usage.keywords || 0,
      limit: limits.keywordSearches,
      percentage: limits.keywordSearches === -1 ? 0 :
        Math.round(((usage.keywords || 0) / limits.keywordSearches) * 100)
    },
    imageCredits: {
      used: usage.imageCredits || 0,
      limit: limits.imageCredits,
      percentage: limits.imageCredits === -1 ? 0 :
        Math.round(((usage.imageCredits || 0) / limits.imageCredits) * 100)
    },
    resetDate: usage.resetDate || getNextResetDate()
  };

  return summary;
}

/**
 * Check if user has remaining quota
 * @param {string} userId - User ID
 * @param {string} metric - Metric to check
 * @param {number} limit - Limit for the metric
 * @returns {Promise<Object>} - Quota check result
 */
export async function hasQuota(userId, metric, limit) {
  if (limit === -1) {
    return { hasQuota: true, remaining: -1 };
  }

  const usage = await getUsage(userId);
  const used = usage[metric] || 0;
  const remaining = limit - used;

  return {
    hasQuota: remaining > 0,
    remaining,
    used,
    limit
  };
}

/**
 * Reset usage for a user (admin function)
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function resetUsage(userId) {
  const usageRef = getUsageRef(userId);

  await usageRef.set({
    userId,
    month: getCurrentMonthKey(),
    listings: 0,
    keywords: 0,
    imageCredits: 0,
    apiCalls: 0,
    resetDate: getNextResetDate(),
    lastUpdated: new Date().toISOString()
  });
}

/**
 * Get all users' usage for admin dashboard
 * @param {number} limit - Max users to return
 * @returns {Promise<Array>} - Usage array
 */
export async function getAllUsage(limit = 100) {
  const db = getDb();
  const monthKey = getCurrentMonthKey();

  const snapshot = await db.collection(COLLECTIONS.USAGE)
    .where('month', '==', monthKey)
    .orderBy('apiCalls', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
