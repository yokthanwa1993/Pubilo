import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/app/lib/firebase-admin';
import { getToken, deleteToken } from '@/app/lib/realtimedb-tokens';
import { google } from 'googleapis';

async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
    const authorization = req.headers.get('Authorization');
    if (authorization?.startsWith('Bearer ')) {
        const idToken = authorization.split('Bearer ')[1];
        try {
            if (!adminAuth) throw new Error('Firebase Admin is not initialized');
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            return decodedToken.uid;
        } catch (_error) {
            console.error("Error verifying ID token:", _error);
            return null;
        }
    }
    return null;
}

async function getYoutubeChannel(uid: string) {
    const tokenData = await getToken(uid, 'youtube');
    if (!tokenData) return null;

    try {
        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        oauth2Client.setCredentials(tokenData);
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        const channelRes = await youtube.channels.list({ part: ['snippet'], mine: true });
        const channel = channelRes.data.items?.[0];

        if (!channel) throw new Error("Could not fetch YouTube channel info.");

        return {
            name: channel.snippet?.title || 'YouTube Channel',
            pfp: channel.snippet?.thumbnails?.default?.url || '/youtube-logo.png'
        };
    } catch (error) {
        console.error(`Invalid YouTube token for user ${uid}, deleting.`, error);
        await deleteToken(uid, 'youtube');
        return null;
    }
}

async function getFacebookPage(uid: string) {
    const tokenData = await getToken(uid, 'facebook');
    if (!tokenData) return null;

    try {
        // A simple validation might be needed here as well in a real app
        return tokenData;
    } catch (error) {
        console.error(`Invalid Facebook token for user ${uid}, deleting.`, error);
        await deleteToken(uid, 'facebook');
        return null;
    }
}

export async function GET(req: NextRequest) {
    const uid = await getUserIdFromRequest(req);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [youtubeChannel, facebookPage] = await Promise.all([
        getYoutubeChannel(uid),
        getFacebookPage(uid)
    ]);

    return NextResponse.json({
        youtube: { channel: youtubeChannel },
        facebook: { page: facebookPage }
    });
} 