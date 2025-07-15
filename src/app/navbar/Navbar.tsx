"use client";

import { useAuth } from '@/app/context/AuthContext';
import { auth } from '@/app/lib/firebase';
import { signOut } from 'firebase/auth';
import Image from 'next/image';
import Link from 'next/link';
import styles from './navbar.module.css';

const UserAvatar = ({ user }: { user: { photoURL?: string | null, email?: string | null } }) => {
    if (user.photoURL) {
        return (
            <Image 
                src={user.photoURL} 
                alt={user.email || 'User Avatar'} 
                width={40} 
                height={40}
                className={styles['user-avatar']}
            />
        );
    }

    const initial = user.email ? user.email.charAt(0).toUpperCase() : '?';

    return (
        <div className={styles['user-avatar-initial']}>
            <span>{initial}</span>
        </div>
    );
};

export default function Navbar() {
    const { user } = useAuth();

    const handleLogout = async () => {
        try {
            // First, sign out from Firebase on the client
            if (auth) {
                await signOut(auth);
            }
            // Then, tell our server to clear the session cookie
            await fetch('/api/auth/session', {
                method: 'DELETE',
            });
            // The onAuthStateChanged listener will then redirect to /login
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    if (!user) {
        return null; // Don't render anything if there's no user
    }

    return (
        <nav className={styles['navbar']}>
            <div className={styles['user-info-container']}>
                <div className={styles['user-info']}>
                    <UserAvatar user={user} />
                    <span>{user.email || 'Welcome'}</span>
                </div>
            </div>
            <div className={styles['navbar-buttons']}>
                <Link href="/history" className={styles['history-button']}>
                    History
                </Link>
                <button onClick={handleLogout} className={styles['logout-button']}>
                    Logout
                </button>
            </div>
        </nav>
    );
}