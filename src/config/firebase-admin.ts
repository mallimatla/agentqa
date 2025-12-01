/**
 * Firebase Admin SDK Configuration
 * Used for server-side operations in Vercel API routes
 *
 * Setup Instructions:
 * 1. Go to Firebase Console > Project Settings > Service Accounts
 * 2. Click "Generate new private key"
 * 3. Download the JSON file
 * 4. Set FIREBASE_ADMIN_CREDENTIALS env var with the JSON content (stringified)
 *    OR set individual FIREBASE_ADMIN_* env vars
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin only once
if (!admin.apps.length) {
  try {
    // Option 1: Full credentials JSON in environment variable
    if (process.env.FIREBASE_ADMIN_CREDENTIALS) {
      const credentials = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);
      admin.initializeApp({
        credential: admin.credential.cert(credentials),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    }
    // Option 2: Individual environment variables
    else if (process.env.FIREBASE_ADMIN_PROJECT_ID) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    }
    // Option 3: Default credentials (for local development with gcloud CLI)
    else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export const adminAuth: ReturnType<typeof admin.auth> = admin.auth();
export const adminDb: ReturnType<typeof admin.firestore> = admin.firestore();
export const adminStorage: ReturnType<typeof admin.storage> = admin.storage();

export default admin;
