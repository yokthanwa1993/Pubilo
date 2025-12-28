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
      userAvatarEl.src = "https://graph.facebook.com/" + response.userId + "/picture?type=normal";
      userNameEl.textContent = "Facebook User";
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
  chrome.tabs.create({ url: "https://pubilo.vercel.app/" }, () => {
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
