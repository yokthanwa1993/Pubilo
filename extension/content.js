// FEWFEED Token Helper v6.0 - Content Script
// Runs on localhost:3000 - waits for tokens to be ready then injects

console.log("[FEWFEED Content] Script loaded on", window.location.href);

// Main function - request tokens from background and wait for them
async function initializeTokens() {
  console.log("[FEWFEED Content] Requesting tokens from background...");

  // Show loading indicator
  showLoadingIndicator();

  try {
    // Ask background to fetch token (this will wait for fetch to complete)
    const data = await chrome.runtime.sendMessage({ action: "fetchToken" });

    // Get existing localStorage values as fallback
    const existingToken = localStorage.getItem("fewfeed_accessToken") || localStorage.getItem("fewfeed_token");
    const existingPostToken = localStorage.getItem("fewfeed_postToken");
    const existingFbDtsg = localStorage.getItem("fewfeed_fbDtsg");
    const existingCookie = localStorage.getItem("fewfeed_cookie");
    const existingUserId = localStorage.getItem("fewfeed_userId");
    const existingUserName = localStorage.getItem("fewfeed_userName");

    // Use new data if available, otherwise keep existing
    const finalToken = data?.fewfeed_accessToken || existingToken || "";
    const finalPostToken = data?.fewfeed_postToken || existingPostToken || "";
    const finalFbDtsg = data?.fewfeed_fbDtsg || existingFbDtsg || "";
    const finalCookie = data?.fewfeed_cookie || existingCookie || "";
    const finalUserId = data?.fewfeed_userId || existingUserId || "";
    const finalUserName = data?.fewfeed_userName || existingUserName || "Facebook User";

    console.log("[FEWFEED Content] Data:", {
      hasAdsToken: !!finalToken,
      hasPostToken: !!finalPostToken,
      hasFbDtsg: !!finalFbDtsg,
      hasUserId: !!finalUserId,
      hasCookie: !!finalCookie,
      fromFetch: !!data?.fewfeed_accessToken,
      fromStorage: !!existingToken
    });

    // Save to localStorage (update with new data)
    if (finalToken) {
      localStorage.setItem("fewfeed_accessToken", finalToken);
      localStorage.setItem("fewfeed_token", finalToken);
    }
    if (finalPostToken) {
      localStorage.setItem("fewfeed_postToken", finalPostToken);
    }
    if (finalFbDtsg) {
      localStorage.setItem("fewfeed_fbDtsg", finalFbDtsg);
    }
    if (finalUserId) {
      localStorage.setItem("fewfeed_userId", finalUserId);
    }
    if (finalUserName) {
      localStorage.setItem("fewfeed_userName", finalUserName);
    }
    if (finalCookie) {
      localStorage.setItem("fewfeed_cookie", finalCookie);
    }

    console.log("[FEWFEED Content] Data saved to localStorage");

    // Notify the page that data is ready
    window.postMessage({
      type: "FEWFEED_COOKIE_INJECTED",
      cookie: finalCookie,
      token: finalToken,
      postToken: finalPostToken,
      fbDtsg: finalFbDtsg,
      userId: finalUserId,
      userName: finalUserName
    }, "*");

    // Auto-trigger OAuth if no post token (only if we have ads token)
    if (!finalPostToken && finalToken) {
      console.log("[FEWFEED Content] No post token found, triggering OAuth...");
      chrome.runtime.sendMessage({ action: "refreshPostToken" });
    }

    // Hide loading indicator
    hideLoadingIndicator();

    // Dispatch custom event for the page to know data is ready
    window.dispatchEvent(new CustomEvent("fewfeed:ready", {
      detail: {
        hasAdsToken: !!finalToken,
        hasPostToken: !!finalPostToken,
        hasFbDtsg: !!finalFbDtsg,
        hasCookie: !!finalCookie
      }
    }));

    console.log("[FEWFEED Content] Token injection complete!");

  } catch (error) {
    console.error("[FEWFEED Content] Error:", error);
    hideLoadingIndicator();
  }
}

// No loading indicator needed - page handles its own skeleton state
function showLoadingIndicator() {
  console.log("[FEWFEED Content] Loading started...");
}

function hideLoadingIndicator() {
  console.log("[FEWFEED Content] Loading complete");
}

// Run initialization
initializeTokens();

// Listen for messages from the page
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  // Page requesting stored data
  if (event.data.type === "FEWFEED_GET_DATA") {
    const response = await chrome.runtime.sendMessage({ action: "getStoredData" });
    window.postMessage({
      type: "FEWFEED_DATA_RESPONSE",
      data: response
    }, "*");
  }

  // Page requesting to fetch Pages from Facebook API
  if (event.data.type === "FEWFEED_FETCH_PAGES") {
    const response = await chrome.runtime.sendMessage({
      action: "fetchPages",
      accessToken: event.data.accessToken,
      cookie: localStorage.getItem("fewfeed_cookie")
    });
    window.postMessage({
      type: "FEWFEED_PAGES_RESPONSE",
      data: response
    }, "*");
  }

  // Page requesting to fetch Ad Accounts from Facebook API
  if (event.data.type === "FEWFEED_FETCH_AD_ACCOUNTS") {
    const response = await chrome.runtime.sendMessage({
      action: "fetchAdAccounts",
      accessToken: event.data.accessToken,
      cookie: localStorage.getItem("fewfeed_cookie")
    });
    window.postMessage({
      type: "FEWFEED_AD_ACCOUNTS_RESPONSE",
      data: response
    }, "*");
  }

  // Page requesting to refresh tokens
  if (event.data.type === "FEWFEED_REFRESH_TOKEN") {
    await initializeTokens();
  }

  // Page requesting to refresh post token specifically (triggers OAuth flow)
  if (event.data.type === "FEWFEED_REFRESH_POST_TOKEN") {
    const response = await chrome.runtime.sendMessage({ action: "refreshPostToken" });
    window.postMessage({
      type: "FEWFEED_POST_TOKEN_REFRESH_STARTED",
      data: response
    }, "*");
  }

  // Page requesting to schedule post via GraphQL (extension has Facebook cookies)
  if (event.data.type === "FEWFEED_SCHEDULE_POST_GRAPHQL") {
    console.log("[FEWFEED Content] Scheduling post via GraphQL:", {
      postId: event.data.postId,
      pageId: event.data.pageId,
      hasFbDtsg: !!event.data.fbDtsg,
      fbDtsgPrefix: event.data.fbDtsg?.substring(0, 20),
      scheduledTime: event.data.scheduledTime
    });

    if (!event.data.fbDtsg) {
      console.error("[FEWFEED Content] WARNING: fb_dtsg is empty!");
    }

    const response = await chrome.runtime.sendMessage({
      action: "schedulePostGraphQL",
      postId: event.data.postId,
      pageId: event.data.pageId,
      fbDtsg: event.data.fbDtsg,
      scheduledTime: event.data.scheduledTime
    });
    console.log("[FEWFEED Content] GraphQL response:", response);
    window.postMessage({
      type: "FEWFEED_SCHEDULE_POST_GRAPHQL_RESPONSE",
      data: response
    }, "*");
  }

  // ============================================
  // LAZADA AFFILIATE LINK CONVERSION
  // ============================================

  // Page requesting to convert Lazada URL to affiliate link
  if (event.data.type === "FEWFEED_CONVERT_LAZADA_LINK") {
    console.log("[FEWFEED Content] Converting Lazada link:", event.data.productUrl);
    const response = await chrome.runtime.sendMessage({
      action: "convertLazadaLink",
      productUrl: event.data.productUrl
    });
    window.postMessage({
      type: "FEWFEED_LAZADA_LINK_RESPONSE",
      data: response
    }, "*");
  }

  // Page requesting to convert Lazada URL for News mode
  if (event.data.type === "FEWFEED_CONVERT_NEWS_LAZADA_LINK") {
    console.log("[FEWFEED Content] Converting News Lazada link:", event.data.productUrl);
    const response = await chrome.runtime.sendMessage({
      action: "convertLazadaLink",
      productUrl: event.data.productUrl
    });
    window.postMessage({
      type: "FEWFEED_NEWS_LAZADA_LINK_RESPONSE",
      data: response
    }, "*");
  }

  // Page requesting to check Lazada login status
  if (event.data.type === "FEWFEED_CHECK_LAZADA_LOGIN") {
    const response = await chrome.runtime.sendMessage({ action: "checkLazadaLogin" });
    window.postMessage({
      type: "FEWFEED_LAZADA_LOGIN_STATUS",
      data: response
    }, "*");
  }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Token updated from Facebook page (fb-content.js extracted it)
  if (request.action === "tokenUpdated") {
    console.log("[FEWFEED Content] Token updated notification received!");
    // Re-initialize to get the new tokens
    initializeTokens();
    sendResponse({ success: true });
    return true;
  }

  // Post token arrived from background OAuth
  if (request.action === "postTokenReady") {
    console.log("[FEWFEED Content] Post token received from background!");
    const postToken = request.postToken;

    // Save to localStorage
    localStorage.setItem("fewfeed_postToken", postToken);

    // Update global var
    window.postMessage({
      type: "FEWFEED_POST_TOKEN_READY",
      postToken: postToken
    }, "*");

    sendResponse({ success: true });
  }
  return true;
});

// Mark that extension is installed
document.documentElement.setAttribute("data-fewfeed-extension", "true");
window.postMessage({ type: "FEWFEED_EXTENSION_READY" }, "*");
console.log("[FEWFEED Content] Extension v6.0 ready - Dual token + Lazada Affiliate support");
