'use client';

import { useState, useEffect } from 'react';
import { PostHistoryItem } from '@/app/lib/realtimedb-history';
import Link from 'next/link';

export default function HistoryClient() {
    const [history, setHistory] = useState<PostHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await fetch('/api/history');
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to fetch history');
                }
                const data = await response.json();
                setHistory(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, []);

    const getStatusChip = (status: PostHistoryItem['status']) => {
        const baseClasses = 'px-3 py-1 text-xs font-bold rounded-full text-white';
        switch (status) {
            case 'success':
                return `${baseClasses} bg-green-500`;
            case 'scheduled':
                return `${baseClasses} bg-blue-500`;
            case 'error':
                return `${baseClasses} bg-red-500`;
            case 'processing':
                return `${baseClasses} bg-yellow-500`;
            default:
                return `${baseClasses} bg-gray-500`;
        }
    };
    
    const getPlatformIcon = (platform: PostHistoryItem['platform']) => {
        switch (platform) {
            case 'facebook':
                return <span className="text-2xl">📘</span>;
            case 'youtube':
                return <span className="text-2xl">📺</span>;
            default:
                return <span className="text-2xl">🌐</span>;
        }
    }

    if (loading) {
        return <div className="text-center p-10">Loading history...</div>;
    }

    if (error) {
        return <div className="text-center p-10 text-red-500">Error: {error}</div>;
    }
    
    if (history.length === 0) {
        return (
            <div className="text-center p-10">
                <h2 className="text-2xl font-bold mb-4">No Post History Found</h2>
                <p className="text-gray-400 mb-6">You haven&apos;t posted anything yet. Go ahead and make your first post!</p>
                <Link href="/" className="bg-primary text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-dark transition-colors">
                    Go to Upload
                </Link>
            </div>
        )
    }

    return (
        <div className="w-full">
            <h1 className="text-3xl font-bold text-white mb-8">Post History</h1>
            <div className="space-y-4">
                {history.map((item, index) => (
                    <div key={index} className="bg-bg-secondary p-4 rounded-lg shadow-md flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {getPlatformIcon(item.platform)}
                            <div>
                                <p className="font-bold text-white">{item.videoTitle}</p>
                                <p className="text-sm text-gray-400">
                                    {new Date(item.timestamp).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {item.videoUrl && (
                                <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    View Post
                                </a>
                            )}
                            <span className={getStatusChip(item.status)}>{item.status}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
} 