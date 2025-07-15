import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state');

  if (!state) {
    return NextResponse.json({ error: 'State parameter is required.' }, { status: 400 });
  }

  try {
    // We just pass the state through, the callback will verify it contains the UID.
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/youtube/callback`
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly'
      ],
      prompt: 'consent',
      state: state // Pass the original state parameter right through to Google
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Error generating auth URL:", error);
    return NextResponse.json({ error: 'Failed to initiate authentication.' }, { status: 500 });
  }
} 