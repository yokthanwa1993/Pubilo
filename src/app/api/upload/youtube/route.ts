import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Buffer } from 'buffer';
import { Readable } from 'stream';
import { adminAuth } from '@/app/lib/firebase-admin';
import { getToken, setToken } from '@/app/lib/realtimedb-tokens';
import { savePostHistory } from '@/app/lib/realtimedb-history';

// This forces the route to be dynamic, which is a good practice for auth-related routes.
export const dynamic = 'force-dynamic';

// Helper to get UID from request
async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
    const authorization = req.headers.get('Authorization');
    if (authorization?.startsWith('Bearer ')) {
        const idToken = authorization.split('Bearer ')[1];
        try {
            if (!adminAuth) throw new Error('Firebase Admin is not initialized');
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            return decodedToken.uid;
        } catch (_error) {
            console.error("Error verifying ID token in youtube/upload:", _error);
            return null; 
        }
    }
    return null;
}

// Helper to get an authenticated OAuth2 client for a specific user
async function getUserYoutubeClient(uid: string) {
    const tokenData = await getToken(uid, 'youtube');

    if (!tokenData) {
        throw new Error('YouTube not connected for this user. Please connect it first.');
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials(tokenData);
    
    // Add an event listener to handle token refreshes.
    // If a new access token is automatically fetched, this event will fire.
    oauth2Client.on('tokens', async (newTokens) => {
        console.log(`YouTube token for user ${uid} was refreshed.`);
        // The new response might not include a refresh token, so we merge it with the old one.
        if (!newTokens.refresh_token && tokenData.refresh_token) {
            newTokens.refresh_token = tokenData.refresh_token;
        }
        // Save the updated (or merged) tokens back to the database.
        await setToken(uid, 'youtube', newTokens);
        console.log(`Refreshed token for user ${uid} saved to Firestore.`);
    });

    return oauth2Client;
}

export async function POST(request: NextRequest) {
    const uid = await getUserIdFromRequest(request);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized user.' }, { status: 401 });
    }

    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const thumbnailFile = formData.get('thumbnail') as File | null;
    const description = formData.get('youtubeDescription') as string || formData.get('description') as string || '';
    const schedulePost = formData.get('schedulePost') as string;
    const publishAt = formData.get('publishAt') as string;

    try {
        const oauth2Client = await getUserYoutubeClient(uid);

        if (!videoFile) {
            return NextResponse.json({ error: 'Video file is required' }, { status: 400 });
        }

        // Split title and description from the received data
        const originalDescription = formData.get('originalDescription') as string || '';
        
        // Title: use original description (max 100 chars)
        const finalTitle = originalDescription.length > 100 ? originalDescription.substring(0, 100) : originalDescription || 'Untitled Video';
        
        // Description: use youtubeDescription (which already includes hashtags)
        const ytDescription = description;

        // Handle scheduling
        let publishAtISO = null;
        const isScheduled = schedulePost === 'true' && publishAt;
        
        if (isScheduled) {
          // The 'publishAt' from the client is already in ISO format.
          publishAtISO = publishAt;
        }

        // Initialize YouTube API with the authenticated client
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        // Convert video file into a buffer, then a readable stream
        const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
        const videoStream = new Readable();
        videoStream.push(videoBuffer);
        videoStream.push(null); // Signals the end of the stream

        // Prepare video metadata
        const videoMetadata = {
          snippet: {
            title: finalTitle,
            description: ytDescription,
            categoryId: '22', // People & Blogs category
          },
          status: {
            privacyStatus: isScheduled ? 'private' : 'public',
            publishAt: publishAtISO || undefined,
          },
        };

        // Upload video to YouTube
        const uploadResponse = await youtube.videos.insert({
          part: ['snippet', 'status'],
          requestBody: videoMetadata,
          media: {
            body: videoStream,
          },
        });

        const videoId = uploadResponse.data.id;

        if (!videoId) {
          throw new Error('YouTube: ไม่ได้รับ Video ID ที่สมบูรณ์');
        }

        // Upload custom thumbnail if provided
        if (thumbnailFile && videoId) {
          try {
            // Thumbnail upload also expects a stream
            const thumbnailBuffer = Buffer.from(await thumbnailFile.arrayBuffer());
            const thumbnailStream = new Readable();
            thumbnailStream.push(thumbnailBuffer);
            thumbnailStream.push(null);

            await youtube.thumbnails.set({
              videoId: videoId,
              media: {
                body: thumbnailStream,
              },
            });
          } catch (thumbnailError) {
            console.error('Failed to upload thumbnail:', thumbnailError);
            // Continue even if thumbnail upload fails
          }
        }

        const videoUrl = `https://www.youtube.com/shorts/${videoId}`;

        await savePostHistory(uid, {
            platform: 'youtube',
            status: isScheduled ? 'scheduled' : 'success',
            videoTitle: description,
            videoUrl: videoUrl,
            postId: videoUrl.split('/').pop() || undefined
        });

        return NextResponse.json({
            success: true,
            videoId: videoId,
            videoUrl: videoUrl,
            message: `YouTube: ${isScheduled ? 'ตั้งเวลาสำเร็จ!' : 'อัปโหลดสำเร็จ!'} <a href="${videoUrl}" target="_blank">ดูวิดีโอ</a>`,
            yt_url: videoUrl,
            is_scheduled: isScheduled,
            publish_at: publishAt || null
        });

    } catch (error) {
        console.error('Error in YouTube upload POST handler:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';

        // Save error to history
        await savePostHistory(uid, {
            platform: 'youtube',
            status: 'error',
            videoTitle: description,
            errorMessage: message
        });

        return NextResponse.json({ error: message }, { status: 500 });
    }
} 