import { cookies } from 'next/headers';
import { adminAuth } from './firebase-admin';
import { DecodedIdToken } from 'firebase-admin/auth';

export async function getFirebaseUser(): Promise<DecodedIdToken | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session');
  if (!sessionCookie?.value) {
    return null;
  }
  if (!adminAuth) {
    console.error("[SSR] Firebase Admin SDK not initialized.");
    return null;
  }
  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie.value, true);
    return decodedToken;
  } catch (error) {
    console.log("[SSR] Failed to verify session cookie, user is logged out.");
    return null;
  }
} 