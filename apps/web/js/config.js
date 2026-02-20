// Pubilo v5.0 - Cloudflare API Configuration
window.API_BASE = 'https://api.pubilo.com';

console.log('[Pubilo] API_BASE:', window.API_BASE);

// Override fetch to automatically prefix API calls
const originalFetch = window.fetch;
window.fetch = function (url, options) {
    if (typeof url === 'string' && url.startsWith('/api/')) {
        url = window.API_BASE + url;
    }
    return originalFetch.call(this, url, options);
};
