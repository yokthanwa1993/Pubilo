"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';

interface LogoutClientProps {
    userName: string;
    initialYoutubeStatus: boolean;
    initialFacebookStatus: boolean;
}

export default function LogoutClient({ userName, initialYoutubeStatus, initialFacebookStatus }: LogoutClientProps) {
    const { user } = useAuth(); // Use auth context to get the user for ID token
    const [youtubeConnected, setYoutubeConnected] = useState(initialYoutubeStatus);
    const [facebookConnected, setFacebookConnected] = useState(initialFacebookStatus);
    const [isLoading, setIsLoading] = useState({ youtube: false, facebook: false });
    const router = useRouter();

    const handleDisconnect = async (platform: 'youtube' | 'facebook') => {
        if (!user) {
            alert("User not found, please re-login.");
            return;
        }

        setIsLoading(prev => ({ ...prev, [platform]: true }));
        
        const url = platform === 'youtube' 
            ? '/api/auth/youtube/status' // This should be a user-specific endpoint
            : '/api/auth/facebook/token';
        
        try {
            const idToken = await user.getIdToken();
            const response = await fetch(url, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${idToken}` }
            });

            if (!response.ok) {
                throw new Error(`Failed to disconnect ${platform}`);
            }

            if (platform === 'youtube') {
                setYoutubeConnected(false);
            } else {
                setFacebookConnected(false);
            }

        } catch (error) {
            console.error(error);
            alert(`Error disconnecting ${platform}.`);
        } finally {
            setIsLoading(prev => ({ ...prev, [platform]: false }));
            router.refresh();
        }
    };

    return (
        <div className="p-8 flex flex-col gap-6">
            <h1 className="app-title text-center">Connection Management</h1>
            <p className="app-subtitle text-center">
                Signed in as: <span style={{color: 'var(--primary-light)'}}>{userName}</span>
            </p>

            {/* YouTube Disconnect Section */}
            <div className={`platform-row ${youtubeConnected ? 'youtube-row' : ''}`}>
                <div className="platform-info">
                    <div className={`platform-icon-large youtube-icon-large`}>📺</div>
                    <div className="platform-details">
                        <p className="platform-name-large">YouTube Connection</p>
                        <p className="platform-description">Status: {youtubeConnected ? 'Connected' : 'Disconnected'}</p>
                    </div>
                </div>
                <div className="link-section">
                    <button 
                        onClick={() => handleDisconnect('youtube')} 
                        className="btn" 
                        disabled={!youtubeConnected || isLoading.youtube}
                        style={{background: youtubeConnected ? 'var(--error)' : 'grey'}}
                    >
                        {isLoading.youtube ? 'Working...' : 'Disconnect YouTube'}
                    </button>
                </div>
            </div>
            
            {/* Facebook Disconnect Section */}
            <div className={`platform-row ${facebookConnected ? 'facebook-row' : ''}`}>
                <div className="platform-info">
                    <div className={`platform-icon-large facebook-icon-large`}>📘</div>
                    <div className="platform-details">
                        <p className="platform-name-large">Facebook Connection</p>
                        <p className="platform-description">Status: {facebookConnected ? 'Connected' : 'Disconnected'}</p>
                    </div>
                </div>
                <div className="link-section">
                    <button 
                        onClick={() => handleDisconnect('facebook')} 
                        className="btn" 
                        disabled={!facebookConnected || isLoading.facebook}
                        style={{background: facebookConnected ? 'var(--error)' : 'grey'}}
                    >
                        {isLoading.facebook ? 'Working...' : 'Disconnect Facebook'}
                    </button>
                </div>
            </div>
        </div>
    );
} 