"use client";

import { useEffect } from 'react';

const FacebookCallbackPage = () => {
  useEffect(() => {
    // This script runs on the client side in the popup window
    if (window.opener) {
      // Extract the access token from the URL hash
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');

      if (accessToken) {
        // Send the access token back to the main window
        window.opener.postMessage({
          type: 'facebook-token',
          token: accessToken,
        }, window.location.origin); // Restrict message to same origin for security
      } else {
         window.opener.postMessage({
          type: 'facebook-token-error',
          error: 'Access token not found in callback URL.',
        }, window.location.origin);
      }

      // Close the popup window
      window.close();
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontFamily: 'sans-serif',
      backgroundColor: '#1a1a2e',
      color: 'white'
    }}>
      <p>Authenticating, please wait...</p>
    </div>
  );
};

export default FacebookCallbackPage; 