import { getFirebaseUser } from './lib/server-auth';
import Link from 'next/link';

export default async function RootPage() {
  const user = await getFirebaseUser();

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Welcome to Pubilo</h1>
          <p className="text-lg mb-8">AI Video Uploader 2025</p>
          <Link 
            href="/login" 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            Get Started
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome back, {user.name || user.email}</h1>
        <p className="text-lg mb-8">Ready to upload your videos?</p>
        <Link 
          href="/home" 
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
