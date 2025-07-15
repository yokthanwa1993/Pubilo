import { cookies } from 'next/headers';
import { adminAuth } from '@/app/lib/firebase-admin';
import LogoutClient from './LogoutClient';
import { getToken } from '@/app/lib/realtimedb-tokens';
import styles from './logout.module.css';

async function getFirebaseUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session');
  if (!sessionCookie?.value) return null;
  try {
    if (!adminAuth) throw new Error('Firebase Admin is not initialized');
    return await adminAuth.verifySessionCookie(sessionCookie.value, true);
  } catch (error) {
    console.error("Failed to verify session cookie on logout page:", error);
    return null;
  }
}

async function getPlatformStatus(uid: string | null, platform: 'youtube' | 'facebook'): Promise<boolean> {
    if (!uid) return false;
    const token = await getToken(uid, platform);
    return !!token;
}

export default async function LogoutPage() {
    const user = await getFirebaseUser();
    
    const youtubeStatus = await getPlatformStatus(user?.uid || null, 'youtube');
    const facebookStatus = await getPlatformStatus(user?.uid || null, 'facebook');

    return (
        <main className={styles['logout-main']}>
            <div className={styles['main-container']}>
                <div className={styles['glass-container']}>
                    <LogoutClient 
                        userName={user?.name || 'User'}
                        initialYoutubeStatus={youtubeStatus}
                        initialFacebookStatus={facebookStatus}
                    />
                </div>
            </div>
        </main>
    );
} 