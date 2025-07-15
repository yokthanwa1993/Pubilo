import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/app/lib/firebase-admin';

export async function POST(req: NextRequest) {
    try {
        const idToken = await req.text();
        // Set session expiration to 5 days.
        const expiresIn = 60 * 60 * 24 * 5 * 1000;
        if (!adminAuth) {
            throw new Error('Firebase Admin is not initialized');
        }
        const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

        const options = {
            name: 'session',
            value: sessionCookie,
            maxAge: expiresIn,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
        };

        const response = NextResponse.json({ status: 'success' }, { status: 200 });
        response.cookies.set(options);
        return response;

    } catch (error) {
        console.error("Error creating session cookie:", error);
        return NextResponse.json({ error: 'Failed to create session.' }, { status: 401 });
    }
}

export async function DELETE() {
    try {
        const response = NextResponse.json({ status: 'success' }, { status: 200 });
        response.cookies.set({
            name: 'session',
            value: '',
            maxAge: 0,
        });
        return response;
    } catch (error) {
        console.error("Error clearing session:", error);
        return NextResponse.json({ error: 'Failed to clear session.' }, { status: 500 });
    }
} 