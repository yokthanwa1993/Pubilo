import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import type { Database } from 'firebase-admin/database';
import fs from 'fs';
import path from 'path';

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'firebase-service-account.json');

// In production on CapRover, this file will be mounted at /app/data/
const PROD_SERVICE_ACCOUNT_PATH = '/app/data/firebase-service-account.json';

const serviceAccountPath = fs.existsSync(PROD_SERVICE_ACCOUNT_PATH)
  ? PROD_SERVICE_ACCOUNT_PATH
  : SERVICE_ACCOUNT_PATH;

// Database URL - use environment variable or fallback to the provided URL
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://multiupload-login-default-rtdb.asia-southeast1.firebasedatabase.app/';

try {
  if (getApps().length === 0) {
    // Try to use environment variable first
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
      const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
      const serviceAccount = JSON.parse(serviceAccountJson);
      
      initializeApp({
        credential: cert(serviceAccount),
        databaseURL: DATABASE_URL
      });
      console.log("Firebase Admin SDK initialized using environment variable.");
    } 
    // Fall back to file-based initialization
    else if (fs.existsSync(serviceAccountPath)) {
      initializeApp({
        credential: cert(serviceAccountPath),
        databaseURL: DATABASE_URL
      });
      console.log("Firebase Admin SDK initialized using service account file.");
    } 
    else {
      console.warn("Firebase Admin SDK not initialized. No service account found.");
    }
  }
} catch (error) {
    console.error("Firebase Admin SDK initialization error:", error);
}

// Get the default app instance
const app = getApps().length ? getApp() : undefined;

// Export auth and database, they will work only if initialization was successful
export const adminAuth = app ? getAuth(app) : null;

// Try to initialize database with explicit error handling
let adminDb: Database | null = null;
if (app) {
  try {
    adminDb = getDatabase(app);
  } catch (error) {
    console.error("Database initialization error:", error);
    console.log("Trying to initialize database with explicit URL...");
    // If the above fails, we'll need to reinitialize the app with the URL
    adminDb = null;
  }
}

export { adminDb }; 