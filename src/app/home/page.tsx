import UploadClient from '../components/UploadClient';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../navbar/Navbar';
import { google } from 'googleapis';
import { getFirebaseUser } from '../lib/server-auth';
import { getToken, deleteToken } from '../lib/realtimedb-tokens';
import styles from './home.module.css';

export const dynamic = 'force-dynamic'; // Force dynamic rendering, disable caching

// --- Interfaces ---
interface YouTubeChannel {
  name: string;
  pfp: string;
}
interface FacebookPage {
  id: string;
  name:string;
  access_token: string;
  category: string;
}

// --- Server-side Data Fetching Functions ---

async function getYoutubeStatus(uid: string | null): Promise<YouTubeChannel | null> {
    console.log(`[SSR] 2. Checking YouTube status for UID: ${uid}`);
    if (!uid) return null;
    
    const tokenData = await getToken(uid, 'youtube');
    if (!tokenData) {
        console.log("[SSR] 2.2. YouTube token not found in Realtime Database.");
        return null;
    }
    console.log("[SSR] 2.3. YouTube token found in Realtime Database. Attempting to validate.");

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials(tokenData);

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        const channelRes = await youtube.channels.list({ part: ['snippet'], mine: true });
        const channel = channelRes.data.items?.[0];

        if (!channel) throw new Error("Could not fetch YouTube channel.");

        return {
            name: channel.snippet?.title || 'YouTube Channel',
            pfp: channel.snippet?.thumbnails?.default?.url || '/youtube-logo.png'
        };
    } catch (error) {
        console.error(`[SSR] 2.4. ERROR - Invalid YouTube token for user ${uid}. Deleting token from Realtime Database.`, error);
        await deleteToken(uid, 'youtube');
        return null;
    }
}

async function getFacebookStatus(uid: string | null): Promise<FacebookPage | null> {
    console.log(`[SSR] 3. Checking Facebook status for UID: ${uid}`);
    if (!uid) return null;
    
    const tokenData = await getToken(uid, 'facebook');
    if (!tokenData) {
        console.log("[SSR] 3.2. Facebook token not found in Realtime Database.");
        return null;
    }
    console.log("[SSR] 3.3. Facebook token found in Realtime Database. Attempting to validate.");

    try {
        const validationUrl = `https://graph.facebook.com/v19.0/me?access_token=${tokenData.access_token}`;
        const response = await fetch(validationUrl);
        const validationData = await response.json();
        if (validationData.error) throw new Error(validationData.error.message);
        
        return tokenData;
    } catch (error) {
        console.error(`[SSR] 3.4. ERROR - Invalid Facebook token for user ${uid}. Deleting token from Realtime Database.`, error);
        await deleteToken(uid, 'facebook');
        return null;
    }
}

export default async function Home() {
  const user = await getFirebaseUser();
  const youtubeChannel = await getYoutubeStatus(user?.uid || null);
  const facebookPage = await getFacebookStatus(user?.uid || null);

  return (
    <ProtectedRoute>
      <Navbar />
      <main className={styles['home-main']}>
        <div className={styles['main-container']}>
          <UploadClient 
            key={user?.uid || 'logged-out'}
            initialYoutubeChannel={youtubeChannel} 
            initialFacebookPage={facebookPage}
          />
        </div>
      </main>
    </ProtectedRoute>
  );
} 