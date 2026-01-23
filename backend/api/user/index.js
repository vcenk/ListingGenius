/**
 * User Management API
 * ListingGenius Backend - Firebase Version
 *
 * Handles user info, registration, and usage stats
 */

import { authenticate, generateToken, getOrCreateUser, getUserById, PLAN_LIMITS } from '../../lib/auth.js';
import { getUsageSummary } from '../../lib/usage.js';
import { json, error, success } from '../../lib/response.js';

export const config = {
  runtime: 'edge'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'info';

  try {
    switch (action) {
      case 'register':
        return await handleRegister(req);
      case 'login':
        return await handleLogin(req);
      case 'info':
        return await handleInfo(req);
      case 'usage':
        return await handleUsage(req);
      default:
        return error('Unknown action', 400);
    }
  } catch (err) {
    console.error('User API error:', err);
    return error('Internal error', 500);
  }
}

/**
 * Register a new anonymous user (device-based)
 */
async function handleRegister(req) {
  if (req.method !== 'POST') {
    return error('Method not allowed', 405);
  }

  const body = await req.json().catch(() => ({}));
  const { deviceId } = body;

  if (!deviceId) {
    return error('Device ID required', 400);
  }

  try {
    // Get or create user in Firestore
    const user = await getOrCreateUser(deviceId);

    // Generate token
    const token = generateToken(user);

    return success({
      user: {
        id: user.id,
        plan: user.plan,
        createdAt: user.createdAt
      },
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    return error('Registration failed', 500);
  }
}

/**
 * Login with device ID
 */
async function handleLogin(req) {
  if (req.method !== 'POST') {
    return error('Method not allowed', 405);
  }

  const body = await req.json().catch(() => ({}));
  const { deviceId } = body;

  if (!deviceId) {
    return error('Device ID required', 400);
  }

  try {
    // Get or create user (same as register for device-based auth)
    const user = await getOrCreateUser(deviceId);

    // Generate new token
    const token = generateToken(user);

    return success({
      user: {
        id: user.id,
        plan: user.plan,
        createdAt: user.createdAt
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return error('Login failed', 500);
  }
}

/**
 * Get user info
 */
async function handleInfo(req) {
  const auth = await authenticate(req);

  if (!auth.authenticated) {
    return error(auth.error, 401);
  }

  const user = auth.user;
  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;

  return success({
    user: {
      id: user.id || user.userId,
      plan: user.plan,
      anonymous: user.anonymous || false
    },
    limits: {
      listingsPerMonth: limits.listingsPerMonth,
      keywordSearches: limits.keywordSearches,
      imageCredits: limits.imageCredits,
      models: limits.models
    }
  });
}

/**
 * Get usage statistics
 */
async function handleUsage(req) {
  const auth = await authenticate(req);

  if (!auth.authenticated) {
    return error(auth.error, 401);
  }

  const user = auth.user;
  const userId = user.id || user.userId;
  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;

  try {
    const usage = await getUsageSummary(userId, limits);

    return success({
      usage,
      plan: user.plan
    });
  } catch (err) {
    console.error('Usage fetch error:', err);
    return error('Failed to fetch usage', 500);
  }
}
