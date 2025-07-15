import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/app/lib/firebase-admin';
import { getToken } from '@/app/lib/realtimedb-tokens';
import { savePostHistory } from '@/app/lib/realtimedb-history';

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

async function getFacebookTokenData(uid: string) {
  const tokenData = await getToken(uid, 'facebook');

  if (!tokenData) {
    throw new Error('Facebook page not connected for this user.');
  }
  
  if (!tokenData.id || !tokenData.access_token) {
      throw new Error('Invalid Facebook token file. Please reconnect the page.');
  }
  return { pageId: tokenData.id, accessToken: tokenData.access_token };
}

export async function POST(request: NextRequest) {
  const uid = await getUserIdFromRequest(request);
  if (!uid) {
      return NextResponse.json({ error: 'Unauthorized user.' }, { status: 401 });
  }

  const formData = await request.formData();
  const videoFile = formData.get('video') as File;
  const thumbnailFile = formData.get('thumbnail') as File | null;
  const description = formData.get('description') as string || '';
  const schedulePost = formData.get('schedulePost') as string;
  const publishAt = formData.get('publishAt') as string;

  try {
    const { pageId, accessToken } = await getFacebookTokenData(uid);
    
    if (!videoFile) {
      return NextResponse.json({ error: 'Video file is required' }, { status: 400 });
    }

    // Add standard hashtags if not already present
    const reelsHashtags = '#เล่าเรื่อง #คลิปไวรัล #reels #viralvideo';
    const baseHashtags = reelsHashtags.split(' ');
    const hashtagsToAppend = [];
    
    for (const tag of baseHashtags) {
      if (!description.includes(tag)) {
        hashtagsToAppend.push(tag);
      }
    }
    
    let fbDescription = description;
    if (hashtagsToAppend.length > 0) {
      fbDescription += ' ' + hashtagsToAppend.join(' ');
    }
    fbDescription = fbDescription.trim();

    // Handle scheduling
    let scheduledTimestamp = null;
    const isScheduled = schedulePost === 'true' && publishAt;
    
    if (isScheduled) {
      // The client now sends a UTC ISO string, so new Date() will parse it correctly as UTC.
      // The client is also responsible for the 15-minute validation.
      const publishTime = new Date(publishAt);
      scheduledTimestamp = Math.floor(publishTime.getTime() / 1000);
    }

    // Convert files to buffers
    const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
    const thumbnailBuffer = thumbnailFile ? Buffer.from(await thumbnailFile.arrayBuffer()) : null;

    // Upload to Facebook Reels
    const reelUrl = await uploadToFacebookReel(
      pageId,
      accessToken,
      videoBuffer,
      thumbnailBuffer,
      fbDescription,
      scheduledTimestamp
    );

    await savePostHistory(uid, {
        platform: 'facebook',
        status: isScheduled ? 'scheduled' : 'success',
        videoTitle: description,
        videoUrl: reelUrl,
        postId: reelUrl.split('/').pop() || undefined
    });

    return NextResponse.json({
      success: true,
      message: `Facebook Reels: ${isScheduled ? 'ตั้งเวลาสำเร็จ!' : 'อัปโหลดสำเร็จ!'} <a href="${reelUrl}" target="_blank">ดู Reel</a>`,
      fb_url: reelUrl,
      description: fbDescription,
      is_scheduled: isScheduled,
      publish_at: publishAt || null
    });

  } catch (_error) {
    console.error('Error in Facebook upload POST handler:', _error);
    const message = _error instanceof Error ? _error.message : 'Unknown error';
    
    // Save error to history
    await savePostHistory(uid, {
        platform: 'facebook',
        status: 'error',
        videoTitle: description,
        errorMessage: message
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function uploadToFacebookReel(
  pageId: string,
  accessToken: string,
  videoBuffer: Buffer,
  thumbnailBuffer: Buffer | null,
  description: string,
  scheduledTimestamp: number | null = null
): Promise<string> {
  const FACEBOOK_GRAPH_API_URL = 'https://graph.facebook.com/v19.0/';
  const baseUrl = `${FACEBOOK_GRAPH_API_URL}${pageId}/video_reels`;
  
  // Step 1a: Initialize upload
  const initUrl = `${baseUrl}?upload_phase=start&access_token=${accessToken}`;
  
  const initResponse = await fetch(initUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!initResponse.ok) {
    const errorData = await initResponse.json();
    throw new Error(`FB Init Failed (HTTP ${initResponse.status}): ${errorData.error?.message || 'Unknown error'}`);
  }
  
  const initData = await initResponse.json();
  if (!initData.video_id) {
    throw new Error('FB Init Failed: No video_id received');
  }
  
  const videoId = initData.video_id;
  const uploadUrl = initData.upload_url;
  
  // Step 1b: Upload video
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `OAuth ${accessToken}`,
      'Offset': '0',
      'File_Size': videoBuffer.length.toString(),
      'Content-Type': 'application/octet-stream',
    },
    body: videoBuffer,
  });
  
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`FB Upload Failed: ${errorText}`);
  }
  
  // Step 1c: Finish upload
  const finishParams = new URLSearchParams({
    video_id: videoId, // Fixed: Added video_id back
    upload_phase: 'finish',
    description: description,
    access_token: accessToken,
  });

  // If thumbnail is provided, upload it first to get a handle
  let thumbnailUploadId: string | null = null;
  if (thumbnailBuffer) {
      try {
          const thumbnailInitUrl = `${FACEBOOK_GRAPH_API_URL}${pageId}/video_thumbnails?access_token=${accessToken}`;
          const thumbInitResponse = await fetch(thumbnailInitUrl, { method: 'POST' });
          if (!thumbInitResponse.ok) {
              const errorData = await thumbInitResponse.json();
              console.warn(`FB Thumbnail Init Failed (HTTP ${thumbInitResponse.status}): ${errorData.error?.message || 'Unknown error'}`);
          } else {
              const thumbInitData = await thumbInitResponse.json();
              if (thumbInitData.upload_url) {
                  const thumbUploadResponse = await fetch(thumbInitData.upload_url, {
                      method: 'POST',
                      headers: {
                          'Authorization': `OAuth ${accessToken}`,
                          'Content-Type': 'application/octet-stream',
                          'File_Size': thumbnailBuffer.length.toString(),
                      },
                      body: thumbnailBuffer,
                  });
                  if (thumbUploadResponse.ok) {
                      thumbnailUploadId = thumbInitData.id;
                  } else {
                      const errorText = await thumbUploadResponse.text();
                      console.warn(`FB Thumbnail Upload Failed: ${errorText}`);
                  }
              }
          }
      } catch (thumbError) {
          console.warn('An exception occurred during thumbnail upload:', thumbError);
      }
  }

  // Append thumbnail ID to finish parameters if available
  if (thumbnailUploadId) {
      finishParams.append('thumbnail_file_id', thumbnailUploadId);
  }
  
  if (scheduledTimestamp) {
    finishParams.append('video_state', 'SCHEDULED');
    finishParams.append('scheduled_publish_time', scheduledTimestamp.toString());
  } else {
    finishParams.append('video_state', 'PUBLISHED');
  }
  
  const finishUrl = `${baseUrl}?${finishParams.toString()}`; // Fixed: Corrected the URL structure
  const finishResponse = await fetch(finishUrl, {
    method: 'POST',
  });
  
  if (!finishResponse.ok) {
    const errorText = await finishResponse.text();
    // Try to delete the video if publish fails
    try {
        await fetch(`${FACEBOOK_GRAPH_API_URL}${videoId}?access_token=${accessToken}`, { method: 'DELETE' });
    } catch (deleteError) {
        console.error('Failed to delete incomplete video artifact:', deleteError);
    }
    throw new Error(`FB Finish Failed: ${errorText}`);
  }
  
  const finishData = await finishResponse.json();
  if (!finishData.success && !finishData.post_id) {
    throw new Error('FB Publish command did not succeed');
  }
  
  // Step 2: Wait for processing until the video is 'ready'
  let isReady = false;
  for (let i = 0; i < 24; i++) { // Poll for up to 2 minutes (24 * 5s)
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    const statusUrl = `${FACEBOOK_GRAPH_API_URL}${videoId}?fields=status&access_token=${accessToken}`;
    const statusResponse = await fetch(statusUrl);

    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      if (statusData.status?.video_status === 'ready') {
        isReady = true;
        break; // Exit loop once ready
      }
    } else {
        // If status check fails, log it but continue polling
        console.warn(`Could not check video status (attempt ${i + 1})`);
    }
  }
  
  if (!isReady) {
    // If the video is still not ready, try to delete the artifact
    try {
        await fetch(`${FACEBOOK_GRAPH_API_URL}${videoId}?access_token=${accessToken}`, { method: 'DELETE' });
    } catch (deleteError) {
        console.error('Failed to delete unprocessed video artifact:', deleteError);
    }
    throw new Error('วิดีโอใช้เวลาประมวลผลนานเกินไปและถูกลบแล้ว กรุณาลองอีกครั้ง');
  }
  
  // Step 3: Set thumbnail. This step is now mandatory if a thumbnail is provided.
  if (thumbnailBuffer) {
    const thumbnailUrl = `${FACEBOOK_GRAPH_API_URL}${videoId}/thumbnails`;
    const thumbnailFormData = new FormData();
    thumbnailFormData.append('access_token', accessToken);
    // Use Blob to send the file buffer with a content type
    const imageBlob = new Blob([thumbnailBuffer], { type: 'image/jpeg' });
    thumbnailFormData.append('source', imageBlob, 'thumbnail.jpg');
    thumbnailFormData.append('is_preferred', 'true');
    
    const thumbnailResponse = await fetch(thumbnailUrl, {
      method: 'POST',
      body: thumbnailFormData,
    });

    if (!thumbnailResponse.ok) {
        const errorData = await thumbnailResponse.json();
        // If thumbnail fails, the entire upload is considered a failure.
        throw new Error(`อัปโหลดวิดีโอสำเร็จ แต่ตั้งค่าภาพปกไม่สำเร็จ: ${errorData.error?.message || 'Unknown error'}`);
    }
  }
  
  return `https://www.facebook.com/reel/${videoId}`;
} 