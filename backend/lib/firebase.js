/**
 * Firebase Admin SDK Initialization
 * ListingGenius Backend
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let app;
let db;
let auth;

/**
 * Initialize Firebase Admin SDK
 * Uses service account credentials from environment variables
 */
function initializeFirebase() {
  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    // Check for service account JSON (preferred for production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
    }
    // Fallback to individual environment variables
    else if (process.env.FIREBASE_PROJECT_ID) {
      app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        }),
        projectId: process.env.FIREBASE_PROJECT_ID
      });
    }
    // Development mode - uses default credentials or emulator
    else {
      console.warn('Firebase: No credentials found, using default initialization');
      app = initializeApp({
        projectId: 'listinggenius-dev'
      });
    }
  }

  db = getFirestore(app);
  auth = getAuth(app);

  return { app, db, auth };
}

// Initialize on import
try {
  initializeFirebase();
} catch (error) {
  console.error('Firebase initialization error:', error);
}

/**
 * Get Firestore instance
 * @returns {FirebaseFirestore.Firestore}
 */
export function getDb() {
  if (!db) {
    initializeFirebase();
  }
  return db;
}

/**
 * Get Auth instance
 * @returns {Auth}
 */
export function getAdminAuth() {
  if (!auth) {
    initializeFirebase();
  }
  return auth;
}

/**
 * Firestore collections
 */
export const COLLECTIONS = {
  USERS: 'users',
  USAGE: 'usage',
  RATE_LIMITS: 'rateLimits',
  SESSIONS: 'sessions'
};

/**
 * Get current month key for usage tracking
 * @returns {string} - Month key (YYYY-MM)
 */
export function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get next month reset date
 * @returns {string} - ISO date string
 */
export function getNextResetDate() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

export { app, db, auth };
