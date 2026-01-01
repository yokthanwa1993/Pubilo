// Pubilo Extension - Popup Script

const skeletonLoader = document.getElementById("skeletonLoader");
const userInfoEl = document.getElementById("userInfo");
const userAvatarEl = document.getElementById("userAvatar");
const userNameEl = document.getElementById("userName");
const userIdEl = document.getElementById("userId");
const openBtn = document.getElementById("openBtn");
const loginBtn = document.getElementById("loginBtn");

// Status badges
const tokenBadge = document.getElementById("tokenBadge");
const cookieBadge = document.getElementById("cookieBadge");
const postBadge = document.getElementById("postBadge");

let cookieData = null;

function createSvgIcon(type) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");

  if (type === "check") {
    const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path1.setAttribute("d", "M22 11.08V12a10 10 0 1 1-5.93-9.14");
    const path2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    path2.setAttribute("points", "22 4 12 14.01 9 11.01");
    svg.appendChild(path1);
    svg.appendChild(path2);
  } else if (type === "error") {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line1.setAttribute("x1", "15");
    line1.setAttribute("y1", "9");
    line1.setAttribute("x2", "9");
    line1.setAttribute("y2", "15");
    const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line2.setAttribute("x1", "9");
    line2.setAttribute("y1", "9");
    line2.setAttribute("x2", "15");
    line2.setAttribute("y2", "15");
    svg.appendChild(circle);
    svg.appendChild(line1);
    svg.appendChild(line2);
  } else {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 6v6l4 2");
    svg.appendChild(circle);
    svg.appendChild(path);
  }
  return svg;
}

function updateBadge(badge, status, label) {
  badge.className = "status-badge " + status;
  badge.textContent = "";
  const iconType = status === "loading" ? "loading" : status === "" ? "check" : "error";
  badge.appendChild(createSvgIcon(iconType));
  badge.appendChild(document.createTextNode(" " + label));
}

// Wait for post token with polling
async function waitForPostToken() {
  const maxAttempts = 30; // 30 seconds max
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const data = await chrome.storage.local.get(["fewfeed_postToken"]);
    console.log("[Popup] Checking post token... attempt", i + 1, data.fewfeed_postToken ? "found!" : "not yet");
    if (data.fewfeed_postToken) {
      updateBadge(postBadge, "", "Post");
      return true;
    }
  }
  updateBadge(postBadge, "error", "Post");
  return false;
}

function showUserInfo() {
  skeletonLoader.classList.add("hidden");
  userInfoEl.classList.remove("hidden");
}

function hideUserInfo() {
  skeletonLoader.classList.add("hidden");
  userInfoEl.classList.add("hidden");
}

// Check Facebook login status on popup open
async function checkStatus() {
  try {
    // Get stored data first
    let tokenResponse = await chrome.runtime.sendMessage({ action: "getStoredData" });
    console.log("[Popup] Stored data:", tokenResponse);

    // If no token stored, fetch for the first time
    if (!tokenResponse || !tokenResponse.accessToken) {
      console.log("[Popup] No stored token, fetching...");
      updateBadge(tokenBadge, "loading", "Token");
      updateBadge(cookieBadge, "loading", "Cookie");
      updateBadge(postBadge, "loading", "Post");

      tokenResponse = await chrome.runtime.sendMessage({ action: "fetchToken" });
      console.log("[Popup] Fetch result:", tokenResponse);
    }

    // Update token badge
    if (tokenResponse && tokenResponse.fewfeed_accessToken) {
      updateBadge(tokenBadge, "", "Token");
    } else if (tokenResponse && tokenResponse.accessToken) {
      updateBadge(tokenBadge, "", "Token");
    } else {
      updateBadge(tokenBadge, "error", "Token");
    }

    // Update cookie badge
    const hasCookie = tokenResponse && (tokenResponse.cookie || tokenResponse.fewfeed_cookie);
    if (hasCookie) {
      updateBadge(cookieBadge, "", "Cookie");
    } else {
      updateBadge(cookieBadge, "error", "Cookie");
    }

    // Update post token badge
    const hasPostToken = tokenResponse && (tokenResponse.postToken || tokenResponse.fewfeed_postToken);
    const hasAdsToken = tokenResponse && (tokenResponse.accessToken || tokenResponse.fewfeed_accessToken);

    if (hasPostToken) {
      updateBadge(postBadge, "", "Post");
    } else if (hasAdsToken) {
      // Has ads token but no post token - auto-trigger OAuth
      updateBadge(postBadge, "loading", "Post");
      console.log("[Popup] No post token, triggering OAuth...");
      chrome.runtime.sendMessage({ action: "refreshPostToken" });

      // Wait and check again
      await waitForPostToken();
    } else {
      updateBadge(postBadge, "error", "Post");
    }

    const response = await chrome.runtime.sendMessage({ action: "getFacebookCookies" });

    if (response.success) {
      cookieData = response;

      // Get stored data including user name
      const data = await chrome.storage.local.get(["fewfeed_accessToken", "fewfeed_userName"]);

      // Set user name
      userNameEl.textContent = data.fewfeed_userName || "Facebook User";
      userIdEl.textContent = "ID: " + response.userId;

      if (data.fewfeed_accessToken) {
        // Use access token for authenticated avatar
        userAvatarEl.src = `https://graph.facebook.com/${response.userId}/picture?type=normal&width=96&height=96&access_token=${data.fewfeed_accessToken}`;
      } else {
        // Fallback to unauthenticated
        userAvatarEl.src = `https://graph.facebook.com/${response.userId}/picture?type=normal&width=96&height=96`;
      }

      // Fallback avatar on error
      userAvatarEl.onerror = () => {
        userAvatarEl.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%237c3aed'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
      };

      showUserInfo();
      loginBtn.classList.add("hidden");

      // Save tokens to server database for Auto-Post feature
      saveTokensToServer(response.userId, data.fewfeed_userName || "Facebook User");
    } else {
      hideUserInfo();
      openBtn.classList.add("hidden");
      loginBtn.classList.remove("hidden");
    }
  } catch (error) {
    console.error("[Popup] Error:", error);
    updateBadge(tokenBadge, "error", "Token");
    updateBadge(cookieBadge, "error", "Cookie");
    updateBadge(postBadge, "error", "Post");
    hideUserInfo();
    loginBtn.classList.remove("hidden");
  }
}

// Open Pubilo with cookie data
openBtn.addEventListener("click", async () => {
  if (!cookieData) return;

  // Store cookie in extension storage for content script to pick up
  await chrome.storage.local.set({
    fewfeed_cookie: cookieData.cookie,
    fewfeed_userId: cookieData.userId,
    fewfeed_ready: true
  });

  // Open Pubilo
  chrome.tabs.create({ url: "https://pubilo.vercel.app/" }, () => {
    window.close();
  });
});

// Open Facebook login
loginBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.facebook.com/" });
  window.close();
});

// Save tokens to server database (with 24-hour cache to avoid spam)
const SERVER_SAVE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

async function saveTokensToServer(userId, userName, forceSync = false) {
  try {
    // Check if we already saved recently (unless force sync)
    if (!forceSync) {
      const { fewfeed_lastServerSave } = await chrome.storage.local.get(["fewfeed_lastServerSave"]);
      const now = Date.now();

      if (fewfeed_lastServerSave && (now - fewfeed_lastServerSave) < SERVER_SAVE_INTERVAL) {
        const hoursAgo = Math.round((now - fewfeed_lastServerSave) / (60 * 60 * 1000));
        console.log("[Popup] Skipping server save - already saved", hoursAgo, "hours ago");
        return;
      }
    }

    const data = await chrome.storage.local.get([
      "fewfeed_accessToken",
      "fewfeed_postToken",
      "fewfeed_fbDtsg",
      "fewfeed_cookie"
    ]);

    // Only save if we have tokens
    if (!data.fewfeed_accessToken && !data.fewfeed_postToken) {
      console.log("[Popup] Skipping server save - no tokens to save");
      return;
    }

    const response = await fetch("https://pubilo.vercel.app/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId,
        userName: userName,
        accessToken: data.fewfeed_accessToken,
        postToken: data.fewfeed_postToken,
        fbDtsg: data.fewfeed_fbDtsg,
        cookie: data.fewfeed_cookie
      })
    });

    const result = await response.json();
    if (result.success) {
      // Mark save time
      await chrome.storage.local.set({ fewfeed_lastServerSave: Date.now() });
      console.log("[Popup] Tokens saved to server - pages updated:", result.pagesUpdated);
      return true;
    } else {
      console.error("[Popup] Failed to save tokens:", result.error);
      return false;
    }
  } catch (error) {
    console.error("[Popup] Error saving tokens to server:", error);
  }
}

// Run on popup open
checkStatus();
