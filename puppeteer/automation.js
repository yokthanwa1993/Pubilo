/**
 * Pubilo Full Automation - Create Link Ads without Browser
 * Flow: Link URL → Gemini Generate Image → Create Ad → Publish to Facebook
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Config
const CONFIG = {
  tokensFile: path.join(__dirname, 'tokens.json'),
  geminiApiKey: process.env.GEMINI_API_KEY || 'AIzaSyCftAcOk07wfD64cuWoXmWx56feYmQFTes',
  freeimageApiKey: process.env.FREEIMAGE_API_KEY || '6d207e02198a847aa98d0a2a901485a5',
  adAccountId: process.env.AD_ACCOUNT_ID || '1148837732288721',
  // Gemini 3 Pro Image Preview - ใช้สร้างรูป
  generationModel: 'gemini-3-pro-image-preview',
  aspectRatio: '1:1',
};

// Load tokens
const loadTokens = () => {
  if (fs.existsSync(CONFIG.tokensFile)) {
    return JSON.parse(fs.readFileSync(CONFIG.tokensFile, 'utf8'));
  }
  throw new Error('tokens.json not found. Run index.js first.');
};

// HTTP request helper
const makeRequest = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    };

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: { ...defaultHeaders, ...options.headers },
    };

    const req = protocol.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
};

// Step 1: Generate Image with Gemini
const generateImage = async (prompt, options = {}) => {
  console.log('[Step 1] Generating image with Gemini...');

  if (!CONFIG.geminiApiKey) {
    throw new Error('GEMINI_API_KEY not set. Export it: export GEMINI_API_KEY=your_key');
  }

  const model = options.model || CONFIG.generationModel;
  const aspectRatio = options.aspectRatio || CONFIG.aspectRatio;
  const customPrompt = options.customPrompt;

  console.log('[Step 1] Model:', model);
  console.log('[Step 1] Aspect Ratio:', aspectRatio);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.geminiApiKey}`;

  let fullPrompt;
  if (customPrompt) {
    // Use custom prompt template - replace placeholders
    fullPrompt = customPrompt
      .replace(/\{\{QUOTE\}\}/g, prompt)
      .replace(/\{\{ASPECT_RATIO\}\}/g, aspectRatio)
      .replace(/\{\{RESOLUTION\}\}/g, options.resolution || '2K');
    // Always append anti-grid instruction
    fullPrompt += '\n\n**สำคัญ:** สร้างแค่ 1 รูปเดียว ห้ามสร้าง grid, collage, 2x2, 4 รูปใน 1 ภาพ';
    console.log('[Step 1] Using custom prompt template');
  } else {
    // Default prompt for product ads
    fullPrompt = `สร้างรูปภาพโฆษณาสินค้า 1 รูป สำหรับ Facebook:

**ข้อห้ามสำคัญ:**
- ห้ามสร้าง grid, collage, 2x2, 4 รูปใน 1 ภาพ
- ต้องเป็นรูปเดียวเท่านั้น

**สไตล์:**
- รูปโฆษณาสินค้าที่ดูน่าสนใจ สะดุดตา
- พื้นหลังสดใส สีสันสวยงาม
- ดูเป็นมืออาชีพ เหมาะกับโพสต์ขายของ
- ไม่ต้องมีข้อความใดๆ ในรูป (จะใส่ทีหลัง)

**รายละเอียดสินค้า:**
${prompt}

**ขนาดรูป:** ${aspectRatio}
**สำคัญ:** ห้ามใส่ข้อความ/ตัวอักษรใดๆ ในรูป สร้างแค่ 1 รูปเดียว`;
  }

  const body = JSON.stringify({
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  });

  const response = await makeRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body,
  });

  if (response.status !== 200) {
    throw new Error(`Gemini API error: ${JSON.stringify(response.data)}`);
  }

  const candidates = response.data.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('No image generated');
  }

  const parts = candidates[0].content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const base64 = part.inlineData.data;
      const mimeType = part.inlineData.mimeType || 'image/png';
      console.log('[Step 1] Image generated successfully!');
      return `data:${mimeType};base64,${base64}`;
    }
  }

  throw new Error('No image data in response');
};

// Step 2: Upload image to freeimage.host
const uploadImage = async (base64Data) => {
  console.log('[Step 2] Uploading image to freeimage.host...');

  if (!CONFIG.freeimageApiKey) {
    throw new Error('FREEIMAGE_API_KEY not set');
  }

  const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');

  // Use form-urlencoded instead of multipart
  const formData = `key=${CONFIG.freeimageApiKey}&source=${encodeURIComponent(base64Content)}&format=json`;

  const response = await makeRequest('https://freeimage.host/api/1/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(formData),
    },
    body: formData,
  });

  if (!response.data.image?.url) {
    throw new Error(`Upload failed: ${JSON.stringify(response.data)}`);
  }

  console.log('[Step 2] Image uploaded:', response.data.image.url);
  return response.data.image.url;
};

// Step 3: Get Ad Accounts (with cookie)
const getAdAccounts = async (accessToken, cookie) => {
  console.log('[Step 3] Getting ad accounts...');

  const url = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`;
  const response = await makeRequest(url, {
    headers: { Cookie: cookie },
  });

  console.log('[Debug] Ad accounts response:', JSON.stringify(response.data).substring(0, 200));

  if (response.data.error) {
    throw new Error(`Ad accounts error: ${response.data.error.message} (code: ${response.data.error.code})`);
  }

  return response.data.data || [];
};

// Step 4: Create Ad Creative (with cookie)
const createAdCreative = async (options) => {
  console.log('[Step 4] Creating ad creative...');

  const { imageUrl, linkUrl, message, pageId, adAccountId, accessToken, cookie } = options;

  // Extract domain from linkUrl for caption
  let caption = '';
  try {
    const urlObj = new URL(linkUrl);
    caption = urlObj.hostname.toUpperCase();
  } catch (e) {
    caption = 'SHOP NOW';
  }

  const payload = {
    object_story_spec: {
      link_data: {
        picture: imageUrl,
        link: linkUrl,
        description: message || '', // This is the post message
        caption: caption, // This must be a URL/domain
        call_to_action: { type: 'SHOP_NOW' },
        multi_share_optimized: true,
        multi_share_end_card: false,
      },
      page_id: pageId,
    },
  };

  const formattedAdAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const url = `https://graph.facebook.com/v21.0/${formattedAdAccountId}/adcreatives?access_token=${accessToken}&fields=effective_object_story_id`;

  const response = await makeRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(payload),
  });

  if (response.data.error) {
    const errorDetail = response.data.error.error_user_msg || response.data.error.error_subcode || '';
    throw new Error(`Create creative failed: ${response.data.error.message} ${errorDetail}`);
  }

  console.log('[Step 4] Ad creative created:', response.data.id);
  return response.data.id;
};

// Step 5: Wait for Post ID (with cookie)
const waitForPostId = async (creativeId, accessToken, cookie, maxAttempts = 10) => {
  console.log('[Step 5] Waiting for post ID...');

  const url = `https://graph.facebook.com/v21.0/${creativeId}?access_token=${accessToken}&fields=effective_object_story_id`;

  for (let i = 1; i <= maxAttempts; i++) {
    const response = await makeRequest(url, {
      headers: { Cookie: cookie },
    });

    if (response.data.effective_object_story_id) {
      console.log('[Step 5] Post ID:', response.data.effective_object_story_id);
      return response.data.effective_object_story_id;
    }

    console.log(`[Step 5] Attempt ${i}/${maxAttempts}...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  throw new Error('Post ID not available after max attempts');
};

// Step 6: Publish Post (with cookie)
const publishPost = async (postId, pageAccessToken, cookie) => {
  console.log('[Step 6] Publishing post...');

  const url = `https://graph.facebook.com/v21.0/${postId}?access_token=${pageAccessToken}`;

  const response = await makeRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ is_published: true }),
  });

  if (response.data.error) {
    throw new Error(`Publish failed: ${response.data.error.message}`);
  }

  console.log('[Step 6] Published successfully!');
  return response.data;
};

// Get Page Access Token (with cookie)
const getPageToken = async (accessToken, pageId, cookie) => {
  const url = `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`;
  const response = await makeRequest(url, {
    headers: { Cookie: cookie },
  });

  if (response.data.error) {
    throw new Error(response.data.error.message);
  }

  const page = response.data.data.find(p => p.id === pageId);
  if (!page) {
    throw new Error('Page not found');
  }

  return page.access_token;
};

// Main automation function
const createLinkAd = async (options) => {
  console.log('='.repeat(50));
  console.log('Pubilo Full Automation');
  console.log('='.repeat(50));

  const { linkUrl, caption, pageId, prompt, adAccountId: optAdAccountId, model, aspectRatio, resolution, customPrompt } = options;
  const tokens = loadTokens();

  if (!tokens.adsToken) {
    throw new Error('Ads Token not found. Run index.js to grab tokens.');
  }
  if (!tokens.cookie) {
    throw new Error('Cookie not found. Run index.js to grab tokens.');
  }

  const cookie = tokens.cookie;

  // Step 1: Generate image
  const imagePrompt = prompt || `สินค้าจากลิงก์: ${linkUrl}`;
  const base64Image = await generateImage(imagePrompt, {
    model: model || CONFIG.generationModel,
    aspectRatio: aspectRatio || CONFIG.aspectRatio,
    resolution: resolution || '2K',
    customPrompt: customPrompt,
  });

  // Step 2: Upload image
  const imageUrl = await uploadImage(base64Image);

  // Step 3: Get ad account (use provided or from env)
  let adAccountId = optAdAccountId || process.env.AD_ACCOUNT_ID;

  if (!adAccountId) {
    // Try to get from API
    console.log('[Step 3] Getting ad accounts...');
    const adAccounts = await getAdAccounts(tokens.adsToken, cookie);
    if (adAccounts.length === 0) {
      throw new Error('No ad accounts found. Set AD_ACCOUNT_ID env variable.');
    }
    adAccountId = adAccounts[0].id;
    console.log('[Info] Using ad account:', adAccounts[0].name, `(${adAccountId})`);
  } else {
    console.log('[Step 3] Using ad account from config:', adAccountId);
  }

  // Step 4: Create ad creative
  const creativeId = await createAdCreative({
    imageUrl,
    linkUrl,
    message: caption || 'สินค้าน่าซื้อ!', // message is the post text
    pageId,
    adAccountId,
    accessToken: tokens.adsToken,
    cookie,
  });

  // Step 5: Wait for post ID
  const postId = await waitForPostId(creativeId, tokens.adsToken, cookie);

  // Step 6: Publish
  const pageToken = await getPageToken(tokens.adsToken, pageId, cookie);
  await publishPost(postId, pageToken, cookie);

  console.log('\n' + '='.repeat(50));
  console.log('SUCCESS!');
  console.log('='.repeat(50));
  console.log('Post URL:', `https://www.facebook.com/${postId}`);

  return {
    success: true,
    postId,
    url: `https://www.facebook.com/${postId}`,
  };
};

// Get unused quote from database
const getUnusedQuote = async (pageId) => {
  const url = `https://pubilo.vercel.app/api/quotes?pageId=${pageId}&limit=100`;
  const response = await makeRequest(url);

  if (!response.data.success || !response.data.quotes) {
    throw new Error('Failed to fetch quotes');
  }

  // Find first unused quote
  const unusedQuote = response.data.quotes.find(q => !q.isUsed);
  if (!unusedQuote) {
    throw new Error('No unused quotes available');
  }

  return unusedQuote;
};

// Mark quote as used
const markQuoteAsUsed = async (quoteId, pageId) => {
  const url = 'https://pubilo.vercel.app/api/quotes';
  const response = await makeRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: quoteId, pageId: pageId }),
  });

  if (!response.data.success) {
    console.warn('[Warning] Failed to mark quote as used:', response.data.error);
    return false;
  }

  console.log('[Quote] Marked as used:', quoteId);
  return true;
};

// Get custom prompt from database
const getCustomPrompt = async (pageId, promptType = 'link_post') => {
  const url = `https://pubilo.vercel.app/api/prompts?pageId=${pageId}&promptType=${promptType}`;
  const response = await makeRequest(url);

  if (!response.data.success || !response.data.prompts || response.data.prompts.length === 0) {
    return null;
  }

  return response.data.prompts[0].prompt_text;
};

// Get page settings from database
const getPageSettings = async (pageId) => {
  const url = `https://pubilo.vercel.app/api/page-settings?pageId=${pageId}`;
  const response = await makeRequest(url);

  if (!response.data.success || !response.data.settings) {
    return null;
  }

  return response.data.settings;
};

// Full automation with quote from database
const createQuotePost = async (options) => {
  console.log('='.repeat(50));
  console.log('Pubilo Quote Post Automation');
  console.log('='.repeat(50));

  const { linkUrl, pageId, sourcePageId } = options;
  const tokens = loadTokens();

  if (!tokens.adsToken || !tokens.cookie) {
    throw new Error('Tokens not found. Run index.js first.');
  }

  // Step 0: Get settings and prompt from source page (or same page)
  const settingsPageId = sourcePageId || pageId;
  console.log('[Step 0] Loading settings from page:', settingsPageId);

  const [settings, customPrompt] = await Promise.all([
    getPageSettings(settingsPageId),
    getCustomPrompt(settingsPageId, 'link_post'),
  ]);

  const model = settings?.ai_model || 'gemini-2.0-flash-exp';
  const aspectRatio = settings?.link_image_size || '1:1';
  const resolution = settings?.ai_resolution || '2K';

  console.log('[Step 0] Model:', model);
  console.log('[Step 0] Aspect Ratio:', aspectRatio);
  console.log('[Step 0] Resolution:', resolution);
  console.log('[Step 0] Custom Prompt:', customPrompt ? 'Yes' : 'No (using default)');

  // Step 1: Get unused quote
  console.log('[Step 1] Getting unused quote for page:', pageId);
  const quote = await getUnusedQuote(pageId);
  console.log('[Step 1] Quote ID:', quote.id);
  console.log('[Step 1] Quote:', quote.quote_text.substring(0, 50) + '...');

  // Step 2: Generate image
  const base64Image = await generateImage(quote.quote_text, {
    model,
    aspectRatio,
    resolution,
    customPrompt,
  });

  // Step 3: Upload image
  const imageUrl = await uploadImage(base64Image);

  // Step 4: Get ad account
  const adAccountId = options.adAccountId || process.env.AD_ACCOUNT_ID;
  if (!adAccountId) {
    throw new Error('AD_ACCOUNT_ID not set');
  }
  console.log('[Step 4] Using ad account:', adAccountId);

  // Step 5: Create ad creative
  const creativeId = await createAdCreative({
    imageUrl,
    linkUrl,
    message: '', // No message, just the image with link
    pageId,
    adAccountId,
    accessToken: tokens.adsToken,
    cookie: tokens.cookie,
  });

  // Step 6: Wait for post ID
  const postId = await waitForPostId(creativeId, tokens.adsToken, tokens.cookie);

  // Step 7: Publish
  const pageToken = await getPageToken(tokens.adsToken, pageId, tokens.cookie);
  await publishPost(postId, pageToken, tokens.cookie);

  // Step 8: Mark quote as used (green highlight)
  await markQuoteAsUsed(quote.id, pageId);

  console.log('\n' + '='.repeat(50));
  console.log('SUCCESS!');
  console.log('='.repeat(50));
  console.log('Quote ID:', quote.id);
  console.log('Quote:', quote.quote_text);
  console.log('Post URL:', `https://www.facebook.com/${postId}`);

  return {
    success: true,
    quoteId: quote.id,
    quoteText: quote.quote_text,
    postId,
    url: `https://www.facebook.com/${postId}`,
  };
};

// Import Lazada functions
const { getProductFeed, getProductWithAffiliateLink } = require('./lazada');

// Full Lazada automation: Fetch product → Get affiliate link → Generate image → Create Facebook ad
const createLazadaAd = async (options = {}) => {
  console.log('='.repeat(50));
  console.log('Pubilo Lazada Automation');
  console.log('='.repeat(50));

  const tokens = loadTokens();
  if (!tokens.adsToken || !tokens.cookie) {
    throw new Error('Facebook tokens not found. Run: node index.js');
  }
  if (!tokens.lazadaCookies) {
    throw new Error('Lazada cookies not found. Run: node cookies.js grab');
  }

  const { pageId, limit = 1, productIndex = 0 } = options;

  // Step 0: Get settings and prompt from database (like createQuotePost)
  if (pageId) {
    console.log('\n[Step 0] Loading settings from database...');
    const [settings, customPrompt] = await Promise.all([
      getPageSettings(pageId),
      getCustomPrompt(pageId, 'link_post'),
    ]);

    if (settings) {
      options.model = settings.ai_model || CONFIG.generationModel;
      options.aspectRatio = settings.link_image_size || CONFIG.aspectRatio;
      options.resolution = settings.ai_resolution || '2K';
      console.log('[Step 0] Model:', options.model);
      console.log('[Step 0] Aspect Ratio:', options.aspectRatio);
      console.log('[Step 0] Resolution:', options.resolution);
    }

    if (customPrompt) {
      options.customPrompt = customPrompt;
      console.log('[Step 0] Custom Prompt: Yes (from database)');
    } else {
      console.log('[Step 0] Custom Prompt: No (using default)');
    }
  }

  // Step 1: Get products from Lazada
  console.log('\n[Step 1] Fetching Lazada products...');
  const feedResult = await getProductFeed({ limit: String(limit) });
  const products = feedResult.result?.data || [];

  if (products.length === 0) {
    throw new Error('No products found from Lazada API');
  }

  const product = products[productIndex] || products[0];
  console.log('[Step 1] Product:', product.productName.substring(0, 50) + '...');
  console.log('[Step 1] Price:', product.currency + product.discountPrice.toLocaleString());
  console.log('[Step 1] Commission:', (product.totalCommissionRate * 100).toFixed(1) + '%');

  // Step 2: Get affiliate short link
  console.log('\n[Step 2] Getting affiliate link...');
  const affiliateResult = await getProductWithAffiliateLink(product.productId);
  const shortLink = affiliateResult.shortLink;
  console.log('[Step 2] Short link:', shortLink);

  // Step 3: Generate image with custom prompt from database
  console.log('\n[Step 3] Generating product image...');

  // Product info for prompt
  const productInfo = `${product.productName}
ราคา: ${product.currency}${product.discountPrice.toLocaleString()}
แบรนด์: ${product.brandName || 'N/A'}
ร้าน: ${product.sellerName || 'N/A'}`;

  const base64Image = await generateImage(productInfo, {
    model: options.model || CONFIG.generationModel,
    aspectRatio: options.aspectRatio || CONFIG.aspectRatio,
    resolution: options.resolution || '2K',
    customPrompt: options.customPrompt, // Use prompt from database
  });

  // Step 4: Upload image
  console.log('\n[Step 4] Uploading image...');
  const imageUrl = await uploadImage(base64Image);
  console.log('[Step 4] Image URL:', imageUrl.substring(0, 60) + '...');

  // Step 5: Create Facebook ad
  if (!pageId) {
    console.log('\n[Result] No pageId - returning data only');
    return {
      success: true,
      product: {
        id: product.productId,
        name: product.productName,
        price: product.discountPrice,
        currency: product.currency,
        commission: product.totalCommissionRate,
        brand: product.brandName,
        seller: product.sellerName,
        image: product.pictures?.[0],
      },
      shortLink,
      imageUrl,
    };
  }

  console.log('\n[Step 5] Creating Facebook ad...');
  const adAccountId = options.adAccountId || CONFIG.adAccountId;
  if (!adAccountId) {
    throw new Error('AD_ACCOUNT_ID not set');
  }

  const caption = options.caption || `${product.productName.substring(0, 100)}
💰 ราคา ${product.currency}${product.discountPrice.toLocaleString()}
🔥 ค่าคอม ${(product.totalCommissionRate * 100).toFixed(1)}%`;

  const creativeId = await createAdCreative({
    imageUrl,
    linkUrl: shortLink,
    message: caption,
    pageId,
    adAccountId,
    accessToken: tokens.adsToken,
    cookie: tokens.cookie,
  });

  // Step 6: Wait for post ID and publish
  const postId = await waitForPostId(creativeId, tokens.adsToken, tokens.cookie);
  const pageToken = await getPageToken(tokens.adsToken, pageId, tokens.cookie);
  await publishPost(postId, pageToken, tokens.cookie);

  console.log('\n' + '='.repeat(50));
  console.log('SUCCESS!');
  console.log('='.repeat(50));
  console.log('Product:', product.productName.substring(0, 50) + '...');
  console.log('Short Link:', shortLink);
  console.log('Post URL:', `https://www.facebook.com/${postId}`);

  return {
    success: true,
    product: {
      id: product.productId,
      name: product.productName,
      price: product.discountPrice,
      commission: product.totalCommissionRate,
    },
    shortLink,
    imageUrl,
    postId,
    postUrl: `https://www.facebook.com/${postId}`,
  };
};

// Export
module.exports = { createLinkAd, createQuotePost, createLazadaAd, generateImage, uploadImage, getUnusedQuote, markQuoteAsUsed, getCustomPrompt, getPageSettings };

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  // Full Lazada automation flow
  if (command === 'lazada') {
    const pageId = args[1];
    if (!pageId) {
      console.log('Usage: node automation.js lazada <pageId>');
      console.log('Example: node automation.js lazada 115143344910256');
      console.log('\nFull flow:');
      console.log('  1. Fetch product from Lazada API');
      console.log('  2. Generate affiliate s.lazada link');
      console.log('  3. Generate product image with Gemini AI');
      console.log('  4. Upload image to freeimage.host');
      console.log('  5. Create Facebook ad creative');
      console.log('  6. Publish to Facebook page');
      process.exit(0);
    }

    createLazadaAd({ pageId })
      .then(result => {
        console.log('\n=== FINAL RESULT ===');
        console.log(JSON.stringify(result, null, 2));
      })
      .catch(err => {
        console.error('\nError:', err.message);
        process.exit(1);
      });
  }
  // Manual link ad
  else if (args.length > 0 && !command.startsWith('-')) {
    const linkUrl = args[0];
    const pageId = args[1] || '115143344910256';
    const caption = args[2] || 'ดูสินค้าเพิ่มเติม!';

    createLinkAd({ linkUrl, pageId, caption })
      .then(result => {
        console.log('\nResult:', JSON.stringify(result, null, 2));
      })
      .catch(err => {
        console.error('\nError:', err.message);
        process.exit(1);
      });
  }
  // Help
  else {
    console.log('Pubilo Automation');
    console.log('='.repeat(40));
    console.log('\nCommands:');
    console.log('  node automation.js lazada <pageId>');
    console.log('    - Full Lazada flow: fetch product → affiliate link → AI image → Facebook post');
    console.log('');
    console.log('  node automation.js <linkUrl> <pageId> [caption]');
    console.log('    - Manual link ad with custom URL');
    console.log('');
    console.log('Example:');
    console.log('  node automation.js lazada 115143344910256');
  }
}
