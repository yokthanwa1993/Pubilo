/**
 * Lazada Cookie Grabber & Short Link Generator
 * Uses same pattern as index.js (Facebook token grabber)
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Use stealth plugin
puppeteer.use(StealthPlugin());

// Config - same as index.js
const CONFIG = {
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  userDataDir: path.join(__dirname, 'chrome-profile'),
  tokensFile: path.join(__dirname, 'tokens.json'),
  lazadaUrl: 'https://www.lazada.co.th/',
  linkToolUrl: 'https://pages.lazada.co.th/wow/gcp/th/aia/link-tool',
  // Lazada affiliate credentials
  lazadaEmail: 'affiliate@chearb.com',
  lazadaPassword: '!@7EvaYLj986',
};

// Human-like delays
const humanDelay = (min = 500, max = 2000) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
};

// MD5 hash for mtop signature
const md5 = (str) => crypto.createHash('md5').update(str).digest('hex');

// Load tokens from file (same as index.js)
const loadTokens = () => {
  try {
    if (fs.existsSync(CONFIG.tokensFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.tokensFile, 'utf8'));
    }
  } catch (e) {}
  return {};
};

// Save tokens to file (same as index.js - merge)
const saveTokens = (tokens) => {
  const existing = loadTokens();
  const updated = { ...existing, ...tokens, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG.tokensFile, JSON.stringify(updated, null, 2));
  console.log('[Tokens] Saved to', CONFIG.tokensFile);
  return updated;
};

// Check if logged in to Lazada
const isLoggedIn = async (page) => {
  const cookies = await page.cookies();
  const lazadaCookies = cookies.filter(c => c.domain.includes('lazada.co.th'));
  const h5tk = lazadaCookies.find(c => c.name === '_m_h5_tk');
  const userId = lazadaCookies.find(c => c.name === 'hng.store.user.id');
  return h5tk && userId;
};

// Extract Lazada cookies
const extractLazadaCookies = async (page) => {
  const cookies = await page.cookies();
  const lazadaCookies = cookies.filter(c => c.domain.includes('lazada.co.th'));

  const h5tk = lazadaCookies.find(c => c.name === '_m_h5_tk');
  const userId = lazadaCookies.find(c => c.name === 'hng.store.user.id');

  return {
    lazadaCookies: lazadaCookies,
    lazadaH5tk: h5tk?.value || null,
    lazadaUserId: userId?.value || null,
  };
};

// Auto login to Lazada
const autoLogin = async (page) => {
  console.log('[Auth] Auto login with affiliate account...');

  // Wait for email input
  await page.waitForSelector('input[placeholder*="Phone or Email"]', { timeout: 10000 });
  await humanDelay(500, 1000);

  // Clear and type email
  const emailInput = await page.$('input[placeholder*="Phone or Email"]');
  await emailInput.click({ clickCount: 3 }); // Select all
  await humanDelay(200, 400);
  await emailInput.type(CONFIG.lazadaEmail, { delay: 50 });
  await humanDelay(500, 1000);

  // Type password
  const passwordInput = await page.$('input[placeholder*="password"]');
  await passwordInput.click();
  await humanDelay(200, 400);
  await passwordInput.type(CONFIG.lazadaPassword, { delay: 50 });
  await humanDelay(500, 1000);

  // Click login button
  const loginButton = await page.$('.iweb-button-mask');
  if (loginButton) {
    await loginButton.click();
    console.log('[Auth] Clicked login button');
  } else {
    // Try other selectors
    await page.click('button[type="submit"], .login-btn, [class*="login"]');
  }

  // Wait for redirect
  await humanDelay(3000, 5000);
};

// Grab Lazada cookies
const grabLazadaCookies = async (options = {}) => {
  console.log('='.repeat(50));
  console.log('Lazada Cookie Grabber - Stealth Mode');
  console.log('='.repeat(50));

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CONFIG.executablePath,
    userDataDir: CONFIG.userDataDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1366,768',
    ],
    defaultViewport: {
      width: 1366,
      height: 768,
    },
  });

  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // Go directly to Link Tool (will redirect to login if needed)
    console.log('[Browser] Opening Link Tool...');
    await page.goto(CONFIG.linkToolUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await humanDelay(2000, 3000);

    // Check if redirected to login page
    const currentUrl = page.url();
    if (currentUrl.includes('login-signup') || currentUrl.includes('member/login')) {
      console.log('[Auth] Redirected to login page');
      await autoLogin(page);

      // Wait for redirect back to Link Tool
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await humanDelay(2000, 3000);
    }

    // Check if on Link Tool page now
    const finalUrl = page.url();
    if (finalUrl.includes('link-tool')) {
      console.log('[Auth] Successfully on Link Tool page!');
    } else {
      console.log('[Auth] Current URL:', finalUrl);
    }

    // Extract cookies
    console.log('[Token] Extracting Lazada cookies...');
    const cookieData = await extractLazadaCookies(page);

    // Save to tokens.json
    saveTokens(cookieData);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Lazada Cookie Extraction Summary:');
    console.log('='.repeat(50));
    console.log('Cookies:', cookieData.lazadaCookies?.length || 0);
    console.log('_m_h5_tk:', cookieData.lazadaH5tk ? 'Yes' : 'No');
    console.log('User ID:', cookieData.lazadaUserId || 'N/A');
    console.log('='.repeat(50));

    if (!options.keepOpen) {
      await browser.close();
    }

    return cookieData;

  } catch (error) {
    console.error('[Error]', error.message);
    if (!options.keepOpen) {
      await browser.close();
    }
    throw error;
  }
};

// Make HTTPS request with cookies
const httpsGet = (url, cookieString) => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://pages.lazada.co.th/',
        'Cookie': cookieString,
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
};

// Convert .html URL to s.lazada short link using mtop API
const getShortLink = async (productUrl) => {
  const tokens = loadTokens();

  if (!tokens.lazadaCookies || !tokens.lazadaH5tk) {
    throw new Error('No Lazada cookies. Run: node cookies.js grab');
  }

  // Get h5tk token (first part before underscore)
  const h5tk = tokens.lazadaH5tk.split('_')[0];
  const cookieString = tokens.lazadaCookies.map(c => `${c.name}=${c.value}`).join('; ');

  // Prepare mtop API params
  const timestamp = Date.now().toString();
  const api = 'mtop.lazada.affiliate.lania.offer.getPromotionLinkFromJumpUrl';
  const v = '1.1';
  const appKey = '24677475';
  const data = JSON.stringify({ jumpUrl: productUrl });

  // Generate signature: md5(token + "&" + timestamp + "&" + appKey + "&" + data)
  const signStr = `${h5tk}&${timestamp}&${appKey}&${data}`;
  const sign = md5(signStr);

  // Build URL
  const params = new URLSearchParams({
    jsv: '2.6.1',
    appKey: appKey,
    t: timestamp,
    sign: sign,
    api: api,
    v: v,
    type: 'originaljson',
    isSec: '1',
    AntiCreep: 'true',
    timeout: '5000',
    needLogin: 'true',
    dataType: 'json',
    sessionOption: 'AutoLoginOnly',
    'x-i18n-language': 'th',
    'x-i18n-regionID': 'TH',
    data: data
  });

  const url = `https://acs-m.lazada.co.th/h5/${api}/${v}/?${params.toString()}`;

  console.log('[mtop] Calling API for:', productUrl.substring(0, 60) + '...');

  const result = await httpsGet(url, cookieString);

  // Extract short link
  const dataObj = result.data || {};
  const shortLink = dataObj.shortLink || dataObj.short_link || dataObj.sLink;

  if (shortLink) {
    console.log('[mtop] Short link:', shortLink);
    return shortLink;
  }

  // Search in JSON string
  const jsonStr = JSON.stringify(result);
  const sLinkMatch = jsonStr.match(/https?:\/\/s\.lazada\.co\.th\/s\.[A-Za-z0-9]+/);
  if (sLinkMatch) {
    console.log('[mtop] Short link:', sLinkMatch[0]);
    return sLinkMatch[0];
  }

  // Check for session error
  if (result.ret) {
    const retStr = result.ret.join(', ');
    if (retStr.includes('SESSION_EXPIRED') || retStr.includes('FAIL_SYS_SESSION')) {
      throw new Error('Session expired. Run: node cookies.js grab');
    }
    throw new Error('API Error: ' + retStr);
  }

  console.log('[mtop] Response:', JSON.stringify(result, null, 2));
  throw new Error('Short link not found in response');
};

// CLI
const main = async () => {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'grab':
      await grabLazadaCookies();
      break;

    case 'shorten':
      if (!arg) {
        console.log('Usage: node cookies.js shorten <lazada-product-url>');
        process.exit(1);
      }
      const shortLink = await getShortLink(arg);
      console.log('\nResult:', shortLink);
      break;

    case 'check':
      const tokens = loadTokens();
      console.log('Lazada Cookies:', tokens.lazadaCookies?.length || 0);
      console.log('_m_h5_tk:', tokens.lazadaH5tk ? 'Yes' : 'No');
      console.log('User ID:', tokens.lazadaUserId || 'N/A');
      break;

    default:
      console.log('Lazada Cookie Manager');
      console.log('='.repeat(40));
      console.log('Commands:');
      console.log('  node cookies.js grab           - Open browser to login');
      console.log('  node cookies.js shorten <url>  - Convert URL to s.lazada');
      console.log('  node cookies.js check          - Check saved cookies');
  }
};

// Export
module.exports = {
  grabLazadaCookies,
  loadTokens,
  saveTokens,
  getShortLink,
  CONFIG,
};

// Run
if (require.main === module) {
  main().catch(err => {
    console.error('[Error]', err.message);
    process.exit(1);
  });
}
