// FEWFEED Cookie Helper - Popup Script

const statusEl = document.getElementById("status");
const userInfoEl = document.getElementById("userInfo");
const userAvatarEl = document.getElementById("userAvatar");
const userNameEl = document.getElementById("userName");
const userIdEl = document.getElementById("userId");
const openBtn = document.getElementById("openBtn");
const loginBtn = document.getElementById("loginBtn");

let cookieData = null;

function setStatus(type, icon, message) {
  statusEl.className = "status " + type;
  statusEl.textContent = "";

  const iconSpan = document.createElement("span");
  iconSpan.className = "status-icon";
  iconSpan.textContent = icon;

  const msgSpan = document.createElement("span");
  msgSpan.textContent = message;

  statusEl.appendChild(iconSpan);
  statusEl.appendChild(msgSpan);
}

// Check Facebook login status on popup open
async function checkStatus() {
  setStatus("loading", "⏳", "Checking Facebook...");

  try {
    const response = await chrome.runtime.sendMessage({ action: "getFacebookCookies" });

    if (response.success) {
      cookieData = response;

      setStatus("success", "✅", "Ready to post!");

      // Show user info
      userInfoEl.style.display = "flex";

      // Try to get stored access token for authenticated image fetch and user name
      chrome.storage.local.get(["fewfeed_accessToken"]).then(async (data) => {
        if (data.fewfeed_accessToken) {
          // Use access token for authenticated request
          const avatarUrl = `https://graph.facebook.com/${response.userId}/picture?type=normal&width=96&height=96&access_token=${data.fewfeed_accessToken}`;
          userAvatarEl.src = avatarUrl;

          // Fetch user's name from Graph API
          try {
            const nameResponse = await fetch(`https://graph.facebook.com/${response.userId}?fields=name&access_token=${data.fewfeed_accessToken}`);
            const userData = await nameResponse.json();
            if (userData.name) {
              userNameEl.textContent = userData.name;
            }
          } catch (e) {
            console.log("Could not fetch user name:", e);
          }
        } else {
          // Fallback to unauthenticated
          userAvatarEl.src = `https://graph.facebook.com/${response.userId}/picture?type=normal&width=96&height=96`;
        }
      });

      // Fallback to default avatar if loading fails
      userAvatarEl.onerror = () => {
        userAvatarEl.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%237c3aed'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
      };

      userNameEl.textContent = "Loading...";
      userIdEl.textContent = "ID: " + response.userId;

      openBtn.style.display = "flex";
      loginBtn.style.display = "none";
    } else {
      setStatus("error", "❌", response.error || "Not logged in");

      userInfoEl.style.display = "none";
      openBtn.style.display = "none";
      loginBtn.style.display = "flex";
    }
  } catch (error) {
    setStatus("error", "❌", "Error: " + error.message);
    loginBtn.style.display = "flex";
  }
}

// Open FEWFEED with cookie data
openBtn.addEventListener("click", async () => {
  if (!cookieData) return;

  // Store cookie in extension storage for content script to pick up
  await chrome.storage.local.set({
    fewfeed_cookie: cookieData.cookie,
    fewfeed_userId: cookieData.userId,
    fewfeed_ready: true
  });

  // Open Pubilo
  chrome.tabs.create({ url: "http://localhost:3000/" }, () => {
    // Close popup
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
