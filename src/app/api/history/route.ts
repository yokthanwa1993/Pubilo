import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseUser } from '@/app/lib/server-auth';
import { getPostHistory } from '@/app/lib/realtimedb-history';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = await getFirebaseUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const history = await getPostHistory(user.uid);
        
        return NextResponse.json(history);

    } catch (error) {
        console.error("Error fetching post history:", error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: message }, { status: 500 });
    }
} 