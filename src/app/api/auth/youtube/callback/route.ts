import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { setToken } from '@/app/lib/realtimedb-tokens';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
        return NextResponse.json({ error: 'Authorization code or state is missing.' }, { status: 400 });
    }

    try {
        const { uid } = JSON.parse(state);
        if (!uid) {
            throw new Error("UID not found in state object.");
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/youtube/callback`
        );

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Save tokens to a user-specific file
        await setToken(uid, 'youtube', tokens);

        // Fetch channel info to display to the user
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        const channelRes = await youtube.channels.list({ part: ['snippet'], mine: true });
        const channel = channelRes.data.items?.[0];

        // Send a message back to the opener window
        const responseHtml = `
            <script>
                if (window.opener) {
                    window.opener.postMessage({ 
                        type: 'youtube-connected', 
                        channel: ${JSON.stringify({
                            name: channel?.snippet?.title || 'YouTube Channel',
                            pfp: channel?.snippet?.thumbnails?.default?.url || '/youtube-logo.png'
                        })}
                    }, '*');
                    window.close();
                }
            </script>
            <p>Authentication successful. You can close this window.</p>
        `;
        
        return new NextResponse(responseHtml, { 
            headers: { 'Content-Type': 'text/html; charset=utf-8' } 
        });

    } catch (error) {
        console.error("Error during YouTube callback:", error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        const errorHtml = `<script>window.opener.postMessage({ error: '${errorMessage}' }, '*'); window.close();</script>`;
        return new NextResponse(errorHtml, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }
} 