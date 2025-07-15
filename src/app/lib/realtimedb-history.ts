import { adminDb } from './firebase-admin';

// Allow build to continue without Firebase Admin during build time
if (!adminDb && process.env.NODE_ENV !== 'production') {
  console.warn('Realtime Database is not initialized. Make sure firebase-admin is configured correctly.');
}

export interface PostHistoryItem {
  platform: 'youtube' | 'facebook' | 'all';
  status: 'success' | 'scheduled' | 'error' | 'processing';
  timestamp: string; // ISO 8601 format
  videoTitle: string;
  videoUrl?: string;
  postId?: string; // e.g., YouTube videoId or Facebook post_id
  errorMessage?: string;
}


export const savePostHistory = async (uid: string, postData: Omit<PostHistoryItem, 'timestamp'>) => {
  if (!adminDb) {
    throw new Error('Realtime Database is not initialized. Make sure firebase-admin is configured correctly.');
  }
  const historyRef = adminDb.ref(`postHistory/${uid}`);
  const newPostRef = historyRef.push(); // Generates a unique ID by Firebase

  const dataToSave: PostHistoryItem = {
    ...postData,
    timestamp: new Date().toISOString(),
  };

  await newPostRef.set(dataToSave);
  return newPostRef.key; // Returns the generated unique key for this history entry
};

export const getPostHistory = async (uid: string): Promise<PostHistoryItem[]> => {
    if (!adminDb) {
      throw new Error('Realtime Database is not initialized. Make sure firebase-admin is configured correctly.');
    }
    const historyRef = adminDb.ref(`postHistory/${uid}`).orderByChild('timestamp').limitToLast(100);
    const snapshot = await historyRef.once('value');
    const historyData = snapshot.val();

    if (!historyData) {
        return [];
    }

    // Convert the object of objects into an array of objects, and sort by timestamp descending
    return Object.values(historyData as Record<string, PostHistoryItem>)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
} 