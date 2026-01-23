/**
 * Firebase Client Configuration
 * ListingGenius Extension
 *
 * This config is for client-side Firebase SDK (future use)
 * For authentication in the extension popup/options pages
 */

export const firebaseConfig = {
  apiKey: "AIzaSyAwgZQrVGuCp8_vVrTrlpE52mfaa8Td4T0",
  authDomain: "listinggenius-22012026.firebaseapp.com",
  projectId: "listinggenius-22012026",
  storageBucket: "listinggenius-22012026.firebasestorage.app",
  messagingSenderId: "148421871854",
  appId: "1:148421871854:web:5c82c6fe87debb05958bff",
  measurementId: "G-PYG8L1MNZ5"
};

/**
 * SECURITY NOTE: This Firebase API key is SAFE to expose publicly.
 *
 * Unlike OpenAI/fal.ai API keys, Firebase API keys are designed to be public.
 * They only identify your Firebase project - they don't grant access.
 *
 * Security is enforced by:
 * 1. Firestore Security Rules - Control who can read/write data
 * 2. Firebase Auth - Verify user identity
 * 3. App Check (optional) - Verify requests come from your app
 *
 * The backend uses a separate SERVICE ACCOUNT (kept secret) for admin operations.
 * This client config is only for user-facing authentication.
 */
