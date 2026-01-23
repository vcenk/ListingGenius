/**
 * Authentication and Authorization Middleware
 * ListingGenius Backend - Firebase Version
 */

import jwt from 'jsonwebtoken';
import { getDb, getAdminAuth, COLLECTIONS } from './firebase.js';

// SECURITY: JWT_SECRET must be set in production - no fallback to prevent weak secrets
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('CRITICAL: JWT_SECRET environment variable is required in production');
}
const EXTENSION_ID = process.env.EXTENSION_ID;

/**
 * Verify request is from valid extension
 * @param {Request} req - Incoming request
 * @returns {Object} - Verification result
 */
export function verifyExtension(req) {
  const extensionId = req.headers['x-extension-id'];

  // In production, verify the extension ID matches
  if (EXTENSION_ID && extensionId !== EXTENSION_ID) {
    return { valid: false, error: 'Invalid extension' };
  }

  return { valid: true };
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} - Decoded payload or error
 */
export function verifyToken(token) {
  if (!JWT_SECRET) {
    return { valid: false, error: 'Server configuration error' };
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, user: decoded };
  } catch (error) {
    return { valid: false, error: 'Invalid or expired token' };
  }
}

/**
 * Verify Firebase ID token
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<Object>} - Decoded token or error
 */
export async function verifyFirebaseToken(idToken) {
  try {
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    return { valid: true, user: decodedToken };
  } catch (error) {
    return { valid: false, error: 'Invalid Firebase token' };
  }
}

/**
 * Generate JWT token for user
 * @param {Object} user - User data
 * @param {string} expiresIn - Token expiration
 * @returns {string} - JWT token
 * @throws {Error} - If JWT_SECRET is not configured
 */
export function generateToken(user, expiresIn = '30d') {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(
    {
      userId: user.id || user.uid,
      email: user.email,
      plan: user.plan || 'free',
      deviceId: user.deviceId
    },
    JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Extract token from Authorization header
 * @param {Request} req - Incoming request
 * @returns {string|null} - Token or null
 */
export function extractToken(req) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return null;
  }

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return authHeader;
}

/**
 * Get or create user in Firestore
 * @param {string} deviceId - Device identifier
 * @returns {Promise<Object>} - User document
 */
export async function getOrCreateUser(deviceId) {
  const db = getDb();
  const usersRef = db.collection(COLLECTIONS.USERS);

  // Try to find existing user by deviceId
  const snapshot = await usersRef.where('deviceId', '==', deviceId).limit(1).get();

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  // Create new user
  const newUser = {
    deviceId,
    plan: 'free',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const docRef = await usersRef.add(newUser);
  return { id: docRef.id, ...newUser };
}

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} - User document or null
 */
export async function getUserById(userId) {
  const db = getDb();
  const doc = await db.collection(COLLECTIONS.USERS).doc(userId).get();

  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() };
}

/**
 * Update user plan
 * @param {string} userId - User ID
 * @param {string} plan - New plan
 * @returns {Promise<void>}
 */
export async function updateUserPlan(userId, plan) {
  const db = getDb();
  await db.collection(COLLECTIONS.USERS).doc(userId).update({
    plan,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Auth middleware for API routes
 * @param {Request} req - Incoming request
 * @returns {Object} - Auth result with user data
 */
export async function authenticate(req) {
  // Verify extension first
  const extCheck = verifyExtension(req);
  if (!extCheck.valid) {
    return { authenticated: false, error: extCheck.error };
  }

  // Check for auth token
  const token = extractToken(req);

  if (!token) {
    // Allow anonymous access with limited features
    return {
      authenticated: true,
      user: {
        id: 'anonymous',
        plan: 'free',
        anonymous: true
      }
    };
  }

  // Try JWT first
  const jwtCheck = verifyToken(token);
  if (jwtCheck.valid) {
    // Optionally refresh user data from Firestore
    const user = await getUserById(jwtCheck.user.userId);
    if (user) {
      return {
        authenticated: true,
        user: {
          ...jwtCheck.user,
          plan: user.plan // Get latest plan from DB
        }
      };
    }
    return { authenticated: true, user: jwtCheck.user };
  }

  // Try Firebase token
  const firebaseCheck = await verifyFirebaseToken(token);
  if (firebaseCheck.valid) {
    return { authenticated: true, user: firebaseCheck.user };
  }

  return { authenticated: false, error: 'Invalid token' };
}

/**
 * Plan limits configuration
 */
export const PLAN_LIMITS = {
  free: {
    listingsPerMonth: 10,
    keywordSearches: 20,
    imageCredits: 5,
    models: ['gpt-4o-mini']
  },
  pro: {
    listingsPerMonth: 100,
    keywordSearches: 500,
    imageCredits: 50,
    models: ['gpt-4o-mini', 'gpt-4o']
  },
  business: {
    listingsPerMonth: -1, // unlimited
    keywordSearches: -1,
    imageCredits: 200,
    models: ['gpt-4o-mini', 'gpt-4o']
  }
};

/**
 * Check if user has access to feature
 * @param {Object} user - User object
 * @param {string} feature - Feature name
 * @param {number} currentUsage - Current usage count
 * @returns {Object} - Access result
 */
export function checkAccess(user, feature, currentUsage = 0) {
  const plan = user.plan || 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const limit = limits[feature];

  if (limit === -1) {
    return { allowed: true, remaining: -1 };
  }

  if (limit === undefined) {
    return { allowed: false, error: 'Unknown feature' };
  }

  if (currentUsage >= limit) {
    return {
      allowed: false,
      error: `${feature} limit reached (${limit}). Upgrade your plan for more.`,
      limit,
      used: currentUsage
    };
  }

  return { allowed: true, remaining: limit - currentUsage };
}
