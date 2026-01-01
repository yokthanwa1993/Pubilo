/**
 * Pubilo Token Grabber - Puppeteer Stealth Edition
 * Grabs Facebook tokens like a real human user
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Config
const CONFIG = {
  // Use real Chrome instead of Chromium (harder to detect)
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',

  // User data directory to persist cookies/sessions
  userDataDir: path.join(__dirname, 'chrome-profile'),

  // URLs
  facebookUrl: 'https://www.facebook.com',
  adsManagerUrl: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns',
  businessUrl: 'https://business.facebook.com',
  postcronOAuthUrl: 'https://postcron.com/api/v2.0/social-accounts/url-redirect/?should_redirect=true&social_network=facebook',

  // Output file for tokens
  tokensFile: path.join(__dirname, 'tokens.json'),
};

// Human-like delays
const humanDelay = (min = 500, max = 2000) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
};

// Human-like typing
const humanType = async (page, selector, text) => {
  await page.waitForSelector(selector, { visible: true });
  await page.click(selector);
  await humanDelay(200, 500);

  for (const char of text) {
    await page.type(selector, char, { delay: Math.floor(Math.random() * 150) + 50 });
  }
};

// Random mouse movement
const randomMouseMove = async (page) => {
  const x = Math.floor(Math.random() * 800) + 100;
  const y = Math.floor(Math.random() * 600) + 100;
  await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 20) + 10 });
};

// Human-like scroll
const humanScroll = async (page, distance = 300) => {
  const steps = Math.floor(Math.random() * 5) + 3;
  const stepDistance = distance / steps;

  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy(0, d), stepDistance);
    await humanDelay(100, 300);
  }
};

// Save tokens to file
const saveTokens = (tokens) => {
  const existing = loadTokens();
  const updated = { ...existing, ...tokens, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG.tokensFile, JSON.stringify(updated, null, 2));
  console.log('[Tokens] Saved to', CONFIG.tokensFile);
  return updated;
};

// Load tokens from file
const loadTokens = () => {
  try {
    if (fs.existsSync(CONFIG.tokensFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.tokensFile, 'utf8'));
    }
  } catch (e) {}
  return {};
};

// Extract cookies from browser
const extractCookies = async (page) => {
  const cookies = await page.cookies();
  const fbCookies = cookies.filter(c => c.domain.includes('facebook.com'));

  const cUser = fbCookies.find(c => c.name === 'c_user');
  const xs = fbCookies.find(c => c.name === 'xs');

  if (cUser && xs) {
    const cookieString = fbCookies.map(c => `${c.name}=${c.value}`).join('; ');
    return {
      userId: cUser.value,
      cookie: cookieString,
      cookies: fbCookies,
    };
  }
  return null;
};

// Extract Ads Token from Ads Manager page
const extractAdsToken = async (page) => {
  console.log('[Token] Navigating to Ads Manager...');
  await page.goto(CONFIG.adsManagerUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await humanDelay(3000, 5000);
  await randomMouseMove(page);

  // Try to extract token from page source
  const pageContent = await page.content();

  // Pattern 1: EAAG token in window.__accessToken or similar
  const tokenPatterns = [
    /accessToken["']?\s*[:=]\s*["']?(EAAG[a-zA-Z0-9]+)/,
    /access_token["']?\s*[:=]\s*["']?(EAAG[a-zA-Z0-9]+)/,
    /"(EAAG[a-zA-Z0-9]{100,})"/,
  ];

  for (const pattern of tokenPatterns) {
    const match = pageContent.match(pattern);
    if (match && match[1]) {
      console.log('[Token] Found Ads Token:', match[1].substring(0, 30) + '...');
      return match[1];
    }
  }

  // Try evaluate in page context
  const token = await page.evaluate(() => {
    // Check various locations where token might be stored
    if (window.__accessToken) return window.__accessToken;
    if (window.Env?.accessToken) return window.Env.accessToken;

    // Search in script tags
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const match = script.textContent?.match(/"(EAAG[a-zA-Z0-9]{100,})"/);
      if (match) return match[1];
    }
    return null;
  });

  if (token) {
    console.log('[Token] Found Ads Token from page context');
    return token;
  }

  console.log('[Token] Could not find Ads Token');
  return null;
};

// Extract fb_dtsg token
const extractFbDtsg = async (page) => {
  const fbDtsg = await page.evaluate(() => {
    // Try input field
    const input = document.querySelector('input[name="fb_dtsg"]');
    if (input) return input.value;

    // Try from DTSGInitialData
    if (window.require) {
      try {
        const dtsg = window.require('DTSGInitialData');
        if (dtsg?.token) return dtsg.token;
      } catch (e) {}
    }

    // Search in page source
    const match = document.documentElement.innerHTML.match(/"DTSGInitialData".*?"token":"([^"]+)"/);
    if (match) return match[1];

    const match2 = document.documentElement.innerHTML.match(/fb_dtsg.*?value="([^"]+)"/);
    if (match2) return match2[1];

    return null;
  });

  if (fbDtsg) {
    console.log('[Token] Found fb_dtsg:', fbDtsg.substring(0, 20) + '...');
  }
  return fbDtsg;
};

// Get Post Token via Postcron OAuth
const extractPostToken = async (page) => {
  console.log('[Token] Getting Post Token via Postcron OAuth...');

  try {
    // Navigate to Postcron OAuth
    await page.goto(CONFIG.postcronOAuthUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await humanDelay(2000, 4000);
  } catch (navError) {
    console.log('[Token] Postcron navigation failed:', navError.message);
    console.log('[Token] Skipping Post Token (can get later via extension)');
    return null;
  }

  // Wait for redirect or token in URL
  let attempts = 0;
  while (attempts < 60) {
    const url = page.url();

    // Check if redirected with access_token
    if (url.includes('access_token=')) {
      const match = url.match(/access_token=([^&]+)/);
      if (match) {
        console.log('[Token] Found Post Token from redirect');
        return decodeURIComponent(match[1]);
      }
    }

    // Try to click "Continue as..." button if it exists (Facebook OAuth)
    try {
      const continueButton = await page.$('[aria-label*="ดำเนินการต่อ"], [aria-label*="Continue as"]');
      if (continueButton) {
        console.log('[Token] Found "Continue as" button, clicking...');
        await humanDelay(500, 1000);
        await continueButton.click();
        await humanDelay(2000, 3000);
      }
    } catch (e) {}

    // Check page content for token
    const content = await page.content();
    const tokenMatch = content.match(/access_token["']?\s*[:=]\s*["']?([^"'&\s]+)/);
    if (tokenMatch && tokenMatch[1].length > 50) {
      console.log('[Token] Found Post Token from page');
      return tokenMatch[1];
    }

    await humanDelay(1000, 2000);
    attempts++;
  }

  console.log('[Token] Could not get Post Token');
  return null;
};

// Check if logged in to Facebook
const isLoggedIn = async (page) => {
  const cookies = await extractCookies(page);
  return cookies !== null;
};

// Main function to grab all tokens
const grabTokens = async (options = {}) => {
  console.log('='.repeat(50));
  console.log('Pubilo Token Grabber - Stealth Mode');
  console.log('='.repeat(50));

  const browser = await puppeteer.launch({
    headless: false, // Set to true for background mode (less safe)
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

  // Set realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Set extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
  });

  try {
    // Go to Facebook
    console.log('[Browser] Opening Facebook...');
    await page.goto(CONFIG.facebookUrl, { waitUntil: 'networkidle2' });
    await humanDelay(2000, 4000);
    await randomMouseMove(page);

    // Check if logged in
    const loggedIn = await isLoggedIn(page);

    if (!loggedIn) {
      console.log('[Auth] Not logged in. Please login manually in the browser window.');
      console.log('[Auth] Waiting for login... (timeout: 10 minutes)');
      console.log('[Auth] >>> Please login to Facebook in the Chrome window <<<\n');

      // Wait for login (check every 5 seconds for 10 minutes)
      let loginAttempts = 0;
      const maxAttempts = 120; // 10 minutes
      while (loginAttempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000)); // Fixed 5 second wait
        const isNowLoggedIn = await isLoggedIn(page);
        if (isNowLoggedIn) {
          console.log('\n[Auth] Login successful!');
          break;
        }
        loginAttempts++;
        process.stdout.write(`\r[Auth] Waiting... ${loginAttempts * 5}s / ${maxAttempts * 5}s`);
      }

      if (!(await isLoggedIn(page))) {
        throw new Error('Login timeout after 10 minutes. Please try again.');
      }
    } else {
      console.log('[Auth] Already logged in!');
    }

    // Extract cookies
    console.log('[Token] Extracting cookies...');
    const cookieData = await extractCookies(page);

    // Extract fb_dtsg
    console.log('[Token] Extracting fb_dtsg...');
    const fbDtsg = await extractFbDtsg(page);

    // Extract Ads Token
    console.log('[Token] Extracting Ads Token...');
    const adsToken = await extractAdsToken(page);

    // Extract Post Token
    let postToken = null;
    if (options.getPostToken !== false) {
      postToken = await extractPostToken(page);
    }

    // Compile all tokens
    const tokens = {
      userId: cookieData?.userId,
      cookie: cookieData?.cookie,
      adsToken,
      postToken,
      fbDtsg,
    };

    // Save tokens
    saveTokens(tokens);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Token Extraction Summary:');
    console.log('='.repeat(50));
    console.log('User ID:', tokens.userId || 'N/A');
    console.log('Cookie:', tokens.cookie ? 'Yes (' + tokens.cookie.length + ' chars)' : 'No');
    console.log('Ads Token:', tokens.adsToken ? 'Yes' : 'No');
    console.log('Post Token:', tokens.postToken ? 'Yes' : 'No');
    console.log('fb_dtsg:', tokens.fbDtsg ? 'Yes' : 'No');
    console.log('='.repeat(50));

    if (!options.keepOpen) {
      await browser.close();
    }

    return tokens;

  } catch (error) {
    console.error('[Error]', error.message);
    if (!options.keepOpen) {
      await browser.close();
    }
    throw error;
  }
};

// Run if called directly
if (require.main === module) {
  grabTokens({ keepOpen: false })
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed:', err.message);
      process.exit(1);
    });
}

module.exports = { grabTokens, loadTokens, saveTokens, CONFIG };
