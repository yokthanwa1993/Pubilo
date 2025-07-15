import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/app/lib/firebase-admin';
import { deleteToken } from '@/app/lib/realtimedb-tokens';

// Force dynamic execution to prevent caching
export const dynamic = 'force-dynamic';

async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
    const authorization = req.headers.get('Authorization');
    if (authorization?.startsWith('Bearer ')) {
        const idToken = authorization.split('Bearer ')[1];
        try {
            if (!adminAuth) throw new Error('Firebase Admin is not initialized');
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            return decodedToken.uid;
        } catch (_error) {
            console.error("Error verifying ID token in youtube/status:", _error);
            return null; // Token is invalid or expired
        }
    }
    return null;
}

export async function DELETE(req: NextRequest) {
  const uid = await getUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await deleteToken(uid, 'youtube');
    return NextResponse.json({ success: true, message: 'YouTube connection deleted successfully' });
  } catch (error) {
    console.error('YouTube disconnect error:', error);
    return NextResponse.json({ success: false, error: 'Failed to disconnect YouTube' }, { status: 500 });
  }
}

// The refresh logic is now centralized in the library, so it's removed from here. 