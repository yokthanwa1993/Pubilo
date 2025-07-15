"use client";

import { useState, useEffect } from 'react';
import { auth } from '@/app/lib/firebase';

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
}

interface FacebookManagerProps {
    initialSelectedPage: FacebookPage | null;
}

export default function FacebookManagerClient({ initialSelectedPage }: FacebookManagerProps) {
  const [manualToken, setManualToken] = useState<string>('');
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [popup, setPopup] = useState<Window | null>(null);
  const [selectedPage, setSelectedPage] = useState<FacebookPage | null>(initialSelectedPage);

  // This effect runs when the 'popup' state changes.
  useEffect(() => {
    if (!popup) {
      return;
    }

    const timer = setInterval(() => {
      if (popup.closed) {
        setShowTokenInput(true);
        setPopup(null);
        clearInterval(timer);
      }
    }, 500);

    return () => {
      clearInterval(timer);
    };
  }, [popup]);

  const handleOpenPopup = () => {
    setError(null);
    setPages([]);
    setShowTokenInput(false);
    setManualToken('');
    const postcronUrl = 'https://postcron.com/api/v2.0/social-accounts/url-redirect/?should_redirect=true&social_network=facebook';
    const width = 600, height = 700;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    setPopup(window.open(postcronUrl, '_blank', `width=${width},height=${height},top=${top},left=${left}`));
  };

  const handleSelectPage = async (page: FacebookPage) => {
    setIsLoading(true);
    try {
      if (!auth) throw new Error("Firebase authentication is not available.");
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated.");
      const idToken = await user.getIdToken();

      const response = await fetch('/api/auth/facebook/token', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(page),
      });

      if (!response.ok) {
        throw new Error('Failed to save the token on the server.');
      }

      // If in a popup, notify the opener window with page data and close
      if (window.opener) {
        window.opener.postMessage({ type: 'facebook-connected', page: page }, '*');
        setTimeout(() => window.close(), 100); // Close after a short delay
        return; // Stop execution to prevent state updates in the popup itself
      }

      setSelectedPage(page);
      setPages([]);
      setShowTokenInput(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred while selecting the page.');
      }
    } finally {
        setIsLoading(false);
    }
  };

  const handleDisconnectPage = async () => {
    setIsLoading(true);
    try {
      if (!auth) throw new Error("Firebase authentication is not available.");
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated.");
      const idToken = await user.getIdToken();

      const response = await fetch('/api/auth/facebook/token', {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${idToken}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete the token on the server.');
      }
      
      setSelectedPage(null);
      setError(null);
      
      // If in a popup, notify the opener window and close
      if (window.opener) {
        window.opener.postMessage({ type: 'facebook-disconnected' }, '*');
        setTimeout(() => window.close(), 100); // Close after a short delay
        return; // Stop execution
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred while disconnecting.');
      }
    } finally {
        setIsLoading(false);
    }
  };

  const fetchPages = async () => {
    if (!manualToken.trim()) {
      setError('Please enter an access token.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setPages([]);

    try {
      const response = await fetch(`https://graph.facebook.com/v23.0/me/accounts?access_token=${manualToken}`);
      const data = await response.json();
      console.log('Facebook API Response:', data);

      if (data.error) throw new Error(data.error.message || 'An unknown error occurred.');
      if (!data.data || data.data.length === 0) {
        setError('No pages found for this access token, or the token is invalid/expired.');
      } else {
        setPages(data.data);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred while fetching pages.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, buttonElement: HTMLButtonElement) => {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = '✅ Copied!';
        setTimeout(() => {
            buttonElement.innerHTML = originalText;
        }, 2000);
    });
  };

  return (
    <div className="p-8">
      <h1 className="app-title text-center mb-2">Facebook Page Manager</h1>
      <p className="app-subtitle text-center mb-8">
        {selectedPage ? `Connected to: ${selectedPage.name}` : 'Connect a Facebook Page to use in the system.'}
      </p>

      {selectedPage ? (
        <div className="text-center flex flex-col gap-4">
           <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="font-bold text-lg text-green-300">Page Connected: {selectedPage.name}</p>
              <p className="text-sm text-gray-400">ID: {selectedPage.id}</p>
           </div>
           <button onClick={handleDisconnectPage} className="btn" style={{background: 'var(--error)'}} disabled={isLoading}>
             {isLoading ? 'Disconnecting...' : 'Disconnect Page'}
           </button>
        </div>
      ) : showTokenInput ? (
        <div className="flex flex-col gap-4">
          <div className="form-group">
            <label htmlFor="manualTokenInput" className="form-label">Paste Your User Access Token:</label>
            <textarea
              id="manualTokenInput"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              className="form-input"
              placeholder="Paste the token starting with 'EAA...' here"
              rows={4}
              style={{minHeight: '100px', fontSize: '0.9rem'}}
            />
          </div>
           <button onClick={fetchPages} className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Fetching...' : 'Fetch Pages with Token'}
          </button>
          <button onClick={handleOpenPopup} className="btn" style={{background: 'var(--secondary)'}}>
              Re-open Popup
          </button>
        </div>
      ) : (
        <button 
          onClick={handleOpenPopup} 
          className="btn btn-primary w-full"
          disabled={!!popup}
        >
          {popup ? 'Waiting for popup to close...' : 'Open Login Popup'}
        </button>
      )}

      {error && !selectedPage && (
        <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
          <p className="font-bold text-red-300">Error:</p>
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {pages.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4 text-center">Your Pages</h2>
          <div className="flex flex-col gap-4">
            {pages.map((page) => (
              <div key={page.id} className="platform-row">
                <div className="platform-info">
                    <div className="platform-icon-large facebook-icon-large">📘</div>
                    <div className="platform-details">
                        <p className="platform-name-large">{page.name}</p>
                        <p className="platform-description">Category: {page.category}</p>
                        <p className="platform-description text-xs break-all">ID: {page.id}</p>
                    </div>
                </div>
                 <div className="link-section flex-col md:flex-row gap-2">
                    <button onClick={() => handleSelectPage(page)} className="btn btn-primary text-sm px-3 py-2" disabled={isLoading}>
                      {isLoading ? '...' : '✅ Select & Use'}
                    </button>
                    <button onClick={(e) => copyToClipboard(page.access_token, e.currentTarget)} className="copy-button-large">
                        📋 Copy Page Token
                    </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 