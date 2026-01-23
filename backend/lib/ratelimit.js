/**
 * Rate Limiting with Firestore
 * ListingGenius Backend
 *
 * Uses Firestore for distributed rate limiting
 * Falls back to in-memory for development
 */

import { getDb, COLLECTIONS } from './firebase.js';

// Rate limit configurations per plan
const RATE_LIMITS = {
  free: {
    requests: 20,
    window: 60 * 1000 // 1 minute
  },
  pro: {
    requests: 100,
    window: 60 * 1000
  },
  business: {
    requests: 500,
    window: 60 * 1000
  }
};

// In-memory fallback for when Firestore is unavailable
const memoryStore = new Map();

/**
 * Clean up expired entries (memory fallback)
 */
function cleanupMemory() {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (now > data.resetAt) {
      memoryStore.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupMemory, 60 * 1000);

/**
 * Check rate limit using Firestore
 * @param {string} identifier - User ID or IP address
 * @param {string} plan - User's plan
 * @returns {Promise<Object>} - Rate limit result
 */
async function checkRateLimitFirestore(identifier, plan = 'free') {
  const now = Date.now();
  const config = RATE_LIMITS[plan] || RATE_LIMITS.free;
  const windowStart = now - config.window;

  const db = getDb();
  const rateLimitRef = db.collection(COLLECTIONS.RATE_LIMITS).doc(identifier);

  try {
    const doc = await rateLimitRef.get();
    let data = doc.exists ? doc.data() : null;

    // Initialize or reset if window expired
    if (!data || data.windowStart < windowStart) {
      data = {
        count: 0,
        windowStart: now,
        resetAt: now + config.window
      };
    }

    // Check if over limit
    if (data.count >= config.requests) {
      const retryAfter = Math.ceil((data.resetAt - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: data.resetAt,
        retryAfter,
        error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`
      };
    }

    // Increment counter
    data.count++;
    data.lastRequest = now;

    await rateLimitRef.set(data);

    return {
      allowed: true,
      remaining: config.requests - data.count,
      resetAt: data.resetAt
    };
  } catch (error) {
    console.error('Firestore rate limit error, falling back to memory:', error);
    return checkRateLimitMemory(identifier, plan);
  }
}

/**
 * Check rate limit using in-memory store (fallback)
 * @param {string} identifier - User ID or IP address
 * @param {string} plan - User's plan
 * @returns {Object} - Rate limit result
 */
function checkRateLimitMemory(identifier, plan = 'free') {
  const now = Date.now();
  const config = RATE_LIMITS[plan] || RATE_LIMITS.free;
  const key = `ratelimit:${identifier}`;

  let data = memoryStore.get(key);

  // Initialize if not exists or window expired
  if (!data || now > data.resetAt) {
    data = {
      count: 0,
      resetAt: now + config.window
    };
  }

  // Check if over limit
  if (data.count >= config.requests) {
    const retryAfter = Math.ceil((data.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: data.resetAt,
      retryAfter,
      error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`
    };
  }

  // Increment counter
  data.count++;
  memoryStore.set(key, data);

  return {
    allowed: true,
    remaining: config.requests - data.count,
    resetAt: data.resetAt
  };
}

/**
 * Check rate limit for a user/IP
 * Uses Firestore if available, otherwise falls back to memory
 * @param {string} identifier - User ID or IP address
 * @param {string} plan - User's plan
 * @returns {Promise<Object>} - Rate limit result
 */
export async function checkRateLimit(identifier, plan = 'free') {
  try {
    // Try Firestore first
    return await checkRateLimitFirestore(identifier, plan);
  } catch (error) {
    // Fall back to memory
    console.warn('Using in-memory rate limiting');
    return checkRateLimitMemory(identifier, plan);
  }
}

/**
 * Rate limit middleware
 * @param {Request} req - Incoming request
 * @param {Object} user - Authenticated user
 * @returns {Promise<Object>} - Rate limit check result
 */
export async function rateLimit(req, user) {
  // Use user ID if authenticated, otherwise use IP
  const identifier = user?.id ||
    user?.userId ||
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    'unknown';

  const plan = user?.plan || 'free';

  return await checkRateLimit(identifier, plan);
}

/**
 * Get rate limit headers for response
 * @param {Object} limitResult - Result from checkRateLimit
 * @returns {Object} - Headers object
 */
export function getRateLimitHeaders(limitResult) {
  return {
    'X-RateLimit-Remaining': String(limitResult.remaining),
    'X-RateLimit-Reset': String(Math.ceil(limitResult.resetAt / 1000))
  };
}

/**
 * Clear rate limit for a user (admin function)
 * @param {string} identifier - User ID or IP
 * @returns {Promise<void>}
 */
export async function clearRateLimit(identifier) {
  try {
    const db = getDb();
    await db.collection(COLLECTIONS.RATE_LIMITS).doc(identifier).delete();
  } catch (error) {
    console.error('Error clearing rate limit:', error);
  }

  // Also clear from memory
  memoryStore.delete(`ratelimit:${identifier}`);
}
