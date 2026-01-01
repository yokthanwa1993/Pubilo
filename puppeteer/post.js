/**
 * Pubilo Post Creator - Using Tokens to Create Facebook Posts/Ads
 * Uses tokens grabbed by index.js to create posts via Facebook API
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load tokens
const loadTokens = () => {
  const tokensFile = path.join(__dirname, 'tokens.json');
  if (fs.existsSync(tokensFile)) {
    return JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
  }
  throw new Error('tokens.json not found. Run index.js first to grab tokens.');
};

// Make HTTP request helper
const makeRequest = (url, method = 'GET', data = null) => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    };

    if (data && method === 'POST') {
      options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
};

// Get list of pages user manages
const getPages = async (accessToken) => {
  const url = `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`;
  const response = await makeRequest(url);

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data || [];
};

// Get page access token
const getPageToken = async (pageId, userToken) => {
  const url = `https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${userToken}`;
  const response = await makeRequest(url);

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.access_token;
};

// Create a link post on a page
const createLinkPost = async (pageId, pageToken, options) => {
  const { link, message, imageUrl } = options;

  // If we have an image, upload it first and create photo post with link
  if (imageUrl) {
    // Upload photo with link in message
    const params = new URLSearchParams({
      url: imageUrl,
      message: message ? `${message}\n\n${link}` : link,
      access_token: pageToken,
    });

    const url = `https://graph.facebook.com/v21.0/${pageId}/photos?${params}`;
    const response = await makeRequest(url, 'POST');

    if (response.error) {
      throw new Error(response.error.message);
    }

    console.log('[Post] Created photo post with link:', response.id || response.post_id);
    return response;
  }

  // Create link post without image
  const params = new URLSearchParams({
    link: link,
    message: message || '',
    access_token: pageToken,
  });

  const url = `https://graph.facebook.com/v21.0/${pageId}/feed?${params}`;
  const response = await makeRequest(url, 'POST');

  if (response.error) {
    throw new Error(response.error.message);
  }

  console.log('[Post] Created link post:', response.id);
  return response;
};

// Get Ad Accounts
const getAdAccounts = async (accessToken) => {
  const url = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`;
  const response = await makeRequest(url);

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data || [];
};

// Upload image to Ad Account
const uploadAdImage = async (adAccountId, accessToken, imageUrl) => {
  // Download image first, then upload
  // For simplicity, we'll use URL-based upload
  const params = new URLSearchParams({
    url: imageUrl,
    access_token: accessToken,
  });

  const url = `https://graph.facebook.com/v21.0/${adAccountId}/adimages?${params}`;
  const response = await makeRequest(url, 'POST');

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response;
};

// Create Ad Creative
const createAdCreative = async (adAccountId, pageId, accessToken, options) => {
  const { name, message, link, imageHash, callToAction = 'LEARN_MORE' } = options;

  const objectStorySpec = {
    page_id: pageId,
    link_data: {
      link: link,
      message: message,
      image_hash: imageHash,
      call_to_action: {
        type: callToAction,
      },
    },
  };

  const params = new URLSearchParams({
    name: name || 'Pubilo Creative',
    object_story_spec: JSON.stringify(objectStorySpec),
    access_token: accessToken,
  });

  const url = `https://graph.facebook.com/v21.0/${adAccountId}/adcreatives?${params}`;
  const response = await makeRequest(url, 'POST');

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response;
};

// Main function to create a post
const createPost = async (options) => {
  console.log('='.repeat(50));
  console.log('Pubilo Post Creator');
  console.log('='.repeat(50));

  const tokens = loadTokens();

  if (!tokens.postToken) {
    throw new Error('Post Token not found. Run index.js to grab tokens.');
  }

  // Get pages
  console.log('[API] Getting pages...');
  const pages = await getPages(tokens.postToken);

  if (pages.length === 0) {
    throw new Error('No pages found. Make sure you have page admin access.');
  }

  console.log('[API] Found pages:');
  pages.forEach((page, i) => {
    console.log(`  ${i + 1}. ${page.name} (${page.id})`);
  });

  // Use first page or specified page
  const targetPage = options.pageId
    ? pages.find(p => p.id === options.pageId)
    : pages[0];

  if (!targetPage) {
    throw new Error('Target page not found');
  }

  console.log(`\n[Post] Creating post on: ${targetPage.name}`);

  // Create the post
  const result = await createLinkPost(targetPage.id, targetPage.access_token, {
    link: options.link,
    message: options.message,
    imageUrl: options.imageUrl,
  });

  console.log('\n[Success] Post created!');
  return result;
};

// Demo: Create a link post
const demo = async () => {
  try {
    // Example usage
    await createPost({
      link: 'https://s.lazada.co.th/s.g9oFa',
      message: 'Check out this amazing product! 🔥',
      imageUrl: 'https://example.com/image.jpg', // Optional: AI generated image URL
      // pageId: '123456789', // Optional: specific page ID
    });
  } catch (error) {
    console.error('[Error]', error.message);
  }
};

// Export functions
module.exports = {
  loadTokens,
  getPages,
  getPageToken,
  createLinkPost,
  getAdAccounts,
  uploadAdImage,
  createAdCreative,
  createPost,
};

// Run demo if called directly
if (require.main === module) {
  // Show usage info
  console.log('='.repeat(50));
  console.log('Pubilo Post Creator - Usage');
  console.log('='.repeat(50));
  console.log('\nThis module provides functions to create Facebook posts/ads');
  console.log('using tokens grabbed by index.js\n');
  console.log('Available functions:');
  console.log('  - getPages(accessToken) - Get list of pages');
  console.log('  - createLinkPost(pageId, pageToken, options) - Create link post');
  console.log('  - getAdAccounts(accessToken) - Get ad accounts');
  console.log('  - createPost(options) - High-level post creator\n');
  console.log('Example:');
  console.log('  const { createPost } = require("./post");');
  console.log('  await createPost({');
  console.log('    link: "https://s.lazada.co.th/...",');
  console.log('    message: "Check out this product!",');
  console.log('    imageUrl: "https://..../image.jpg"');
  console.log('  });');
  console.log('='.repeat(50));

  // Test loading tokens and getting pages
  const tokens = loadTokens();
  console.log('\nTokens loaded successfully!');
  console.log('Post Token:', tokens.postToken ? 'Yes' : 'No');
  console.log('Ads Token:', tokens.adsToken ? 'Yes' : 'No');

  // Try to get pages
  if (tokens.postToken) {
    console.log('\nFetching pages...');
    getPages(tokens.postToken)
      .then(pages => {
        console.log('Pages found:', pages.length);
        pages.forEach(p => console.log(`  - ${p.name} (${p.id})`));
      })
      .catch(err => console.error('Error:', err.message));
  }
}
