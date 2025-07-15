import { adminDb } from './firebase-admin';

// Allow build to continue without Firebase Admin during build time
if (!adminDb && process.env.NODE_ENV !== 'production') {
  console.warn('Realtime Database is not initialized. Make sure firebase-admin is configured correctly.');
}

const db = adminDb;

export const setToken = async (uid: string, platform: 'youtube' | 'facebook', tokenData: object) => {
  if (!db) {
    throw new Error('Realtime Database is not initialized. Make sure firebase-admin is configured correctly.');
  }
  const tokenRef = db.ref(`tokens/${uid}/${platform}`);
  await tokenRef.set(tokenData);
};

export const getToken = async (uid: string, platform: 'youtube' | 'facebook') => {
  if (!db) {
    throw new Error('Realtime Database is not initialized. Make sure firebase-admin is configured correctly.');
  }
  const tokenRef = db.ref(`tokens/${uid}/${platform}`);
  const snapshot = await tokenRef.once('value');
  return snapshot.val();
};

export const deleteToken = async (uid: string, platform: 'youtube' | 'facebook') => {
  if (!db) {
    throw new Error('Realtime Database is not initialized. Make sure firebase-admin is configured correctly.');
  }
  const tokenRef = db.ref(`tokens/${uid}/${platform}`);
  await tokenRef.remove();
}; 