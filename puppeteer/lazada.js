/**
 * Lazada Affiliate API - Get Products and Tracking Links
 * Uses Lazada Open API with signature
 */

const https = require('https');
const crypto = require('crypto');

// Lazada Affiliate Credentials
const CONFIG = {
  appKey: '105827',
  appSecret: 'r8ZMKhPxu1JZUCwTUBVMJiJnZKjhWeQF',
  userToken: '371a3da7699c4886a4486dec0e762d1b',
  baseUrl: 'https://api.lazada.co.th/rest',
};

// Generate HMAC-SHA256 signature for Lazada Open API
const generateSign = (apiPath, params, secret) => {
  // Sort parameters by key
  const sortedKeys = Object.keys(params).sort();

  // Build string to sign: apiPath + sorted key-value pairs
  let signStr = apiPath;
  for (const key of sortedKeys) {
    signStr += key + params[key];
  }

  // HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signStr);
  return hmac.digest('hex').toUpperCase();
};

// Lazada API request with signature
const lazadaRequest = (apiPath, params = {}) => {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();

    // Add common params (without sign)
    const allParams = {
      app_key: CONFIG.appKey,
      timestamp: timestamp.toString(),
      sign_method: 'sha256',
      userToken: CONFIG.userToken,
      ...params,
    };

    // Generate signature
    const sign = generateSign(apiPath, allParams, CONFIG.appSecret);
    allParams.sign = sign;

    // Build query string
    const queryString = Object.entries(allParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const url = `${CONFIG.baseUrl}${apiPath}?${queryString}`;
    console.log('[DEBUG] Request URL:', url.substring(0, 150) + '...');

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    }).on('error', reject);
  });
};

// Get product feed
// offerType: 1 = Regular offer, 2 = MM offer, 3 = DM offer
const getProductFeed = async (options = {}) => {
  const params = {
    offerType: options.offerType || '1', // 1 = Regular offer
    page: options.page || '1',
    limit: options.limit || '10',
  };

  if (options.categoryL1) {
    params.categoryL1 = options.categoryL1;
  }

  console.log('[Lazada] Fetching product feed...');
  const response = await lazadaRequest('/marketing/product/feed', params);
  return response;
};

// Get tracking link for a product by productId
const getTrackingLink = async (productId) => {
  const params = {
    productId: productId,
  };

  console.log('[Lazada] Getting tracking link for productId:', productId);
  const response = await lazadaRequest('/marketing/product/link', params);
  return response;
};

// Follow redirect to get final .html URL
const followRedirect = async (trackingLink) => {
  return new Promise((resolve, reject) => {
    console.log('[Lazada] Following redirect:', trackingLink);

    const urlObj = new URL(trackingLink);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      // Get redirect location
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log('[Lazada] Redirected to:', res.headers.location.substring(0, 100) + '...');
        resolve(res.headers.location);
      } else {
        // Follow the response body for JS redirect
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          // Try to find redirect URL in body
          const match = body.match(/https:\/\/www\.lazada\.co\.th\/products\/[^"'\s]+\.html/);
          if (match) {
            resolve(match[0]);
          } else {
            resolve(trackingLink); // Return original if no redirect found
          }
        });
      }
    });

    req.on('error', reject);
    req.end();
  });
};

// Extract clean .html URL (remove query params)
const getCleanProductUrl = (fullUrl) => {
  try {
    const urlObj = new URL(fullUrl);
    // Keep only the path up to .html
    const htmlMatch = urlObj.pathname.match(/\/products\/[^?]+\.html/);
    if (htmlMatch) {
      return `https://www.lazada.co.th${htmlMatch[0]}`;
    }
    return fullUrl.split('?')[0];
  } catch (e) {
    return fullUrl.split('?')[0];
  }
};

// Full flow: Get product → tracking link → .html URL → short link
const getProductWithShortLink = async (productId) => {
  console.log(`\n[Flow] Getting short link for product ${productId}`);

  // Step 1: Get tracking link (c.lazada.co.th)
  const linkResult = await getTrackingLink(productId);
  if (!linkResult.result?.data?.trackingLink) {
    throw new Error('Failed to get tracking link');
  }
  const trackingLink = linkResult.result.data.trackingLink;
  console.log('[Flow] Step 1 - Tracking link:', trackingLink);

  // Step 2: Follow redirect to get .html URL
  const fullUrl = await followRedirect(trackingLink);
  const cleanUrl = getCleanProductUrl(fullUrl);
  console.log('[Flow] Step 2 - Clean .html URL:', cleanUrl);

  // Step 3: Return info (short link needs mtop API via browser)
  return {
    productId,
    trackingLink,    // c.lazada.co.th/t/c.XXX
    productUrl: cleanUrl,  // www.lazada.co.th/products/xxx.html
    // shortLink needs to be generated via browser/mtop API
  };
};

// Demo: Get products and show tracking links
const demo = async () => {
  console.log('='.repeat(60));
  console.log('Lazada Affiliate API - Product Feed Demo');
  console.log('='.repeat(60));

  try {
    // Get 10 products
    const feedResult = await getProductFeed({ limit: '10' });

    // Response structure: result.data[]
    const products = feedResult.result?.data || [];

    if (products.length > 0) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`พบสินค้า ${products.length} รายการ`);
      console.log('='.repeat(60));

      for (let i = 0; i < Math.min(products.length, 10); i++) {
        const p = products[i];
        console.log(`\n${'-'.repeat(55)}`);
        console.log(`สินค้าที่ ${i + 1}:`);
        console.log(`  Product ID: ${p.productId}`);
        console.log(`  ชื่อ: ${p.productName}`);
        console.log(`  ราคา: ${p.currency}${p.discountPrice.toLocaleString()}`);
        console.log(`  ค่าคอม: ${(p.totalCommissionRate * 100).toFixed(1)}% (${p.currency}${p.totalCommissionAmount.toLocaleString()})`);
        console.log(`  แบรนด์: ${p.brandName}`);
        console.log(`  ร้าน: ${p.sellerName}`);
        console.log(`  รูป: ${p.pictures?.[0] || 'N/A'}`);
      }

      // Get full flow for first product
      console.log(`\n${'='.repeat(60)}`);
      console.log('ทดสอบ Full Flow สินค้าแรก');
      console.log('='.repeat(60));

      const firstProduct = products[0];
      const result = await getProductWithShortLink(firstProduct.productId);

      console.log(`\n${'='.repeat(60)}`);
      console.log('RESULT:');
      console.log('='.repeat(60));
      console.log('Product ID:', result.productId);
      console.log('Tracking Link (c.lazada):', result.trackingLink);
      console.log('Product URL (.html):', result.productUrl);
      console.log('\n[NOTE] เอา Product URL ไปใส่ใน Link Tool เพื่อย่อเป็น s.lazada.co.th');

    } else {
      console.log('\n[No products in response]');
      console.log('Response:', JSON.stringify(feedResult, null, 2));
    }

  } catch (error) {
    console.error('[Error]', error.message);
    console.error(error.stack);
  }
};

// Import getShortLink from cookies.js
const { getShortLink } = require('./cookies');

// Full flow: Get product → tracking link → .html URL → s.lazada short link
const getProductWithAffiliateLink = async (productId) => {
  console.log(`\n[Flow] Getting affiliate link for product ${productId}`);

  // Step 1: Get tracking link (c.lazada.co.th)
  const linkResult = await getTrackingLink(productId);
  if (!linkResult.result?.data?.trackingLink) {
    throw new Error('Failed to get tracking link');
  }
  const trackingLink = linkResult.result.data.trackingLink;
  console.log('[Flow] Step 1 - Tracking link:', trackingLink);

  // Step 2: Follow redirect to get .html URL
  const fullUrl = await followRedirect(trackingLink);
  const cleanUrl = getCleanProductUrl(fullUrl);
  console.log('[Flow] Step 2 - Product URL:', cleanUrl);

  // Step 3: Convert to s.lazada short link
  const shortLink = await getShortLink(cleanUrl);
  console.log('[Flow] Step 3 - Short link:', shortLink);

  return {
    productId,
    trackingLink,
    productUrl: cleanUrl,
    shortLink,
  };
};

// Export
module.exports = {
  getProductFeed,
  getTrackingLink,
  getProductWithShortLink,
  getProductWithAffiliateLink,
  followRedirect,
  getCleanProductUrl,
  lazadaRequest,
  CONFIG,
};

// Run demo
if (require.main === module) {
  demo();
}
