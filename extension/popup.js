// Pubilo Extension - Popup Script

const skeletonLoader = document.getElementById("skeletonLoader");
const userInfoEl = document.getElementById("userInfo");
const userAvatarEl = document.getElementById("userAvatar");
const userNameEl = document.getElementById("userName");
const userIdEl = document.getElementById("userId");
const openBtn = document.getElementById("openBtn");
const loginBtn = document.getElementById("loginBtn");

let cookieData = null;

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
    // First trigger token fetch to ensure we have latest data
    const tokenResponse = await chrome.runtime.sendMessage({ action: "fetchToken" });
    console.log("[Popup] Token fetch result:", tokenResponse);

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
    } else {
      hideUserInfo();
      openBtn.classList.add("hidden");
      loginBtn.classList.remove("hidden");
    }
  } catch (error) {
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

// Run on popup open
checkStatus();
