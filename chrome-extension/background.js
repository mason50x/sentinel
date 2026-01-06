/**
 * Claude Focus Guard - Background Service Worker
 * Handles periodic status checks and coordinates with content scripts
 */

const SERVER_URL = 'http://localhost:8765';
const CHECK_INTERVAL_MINUTES = 1;

let lastKnownStatus = { isActive: false };

/**
 * Check Claude status from the webhook server
 */
async function checkClaudeStatus() {
  try {
    const response = await fetch(`${SERVER_URL}/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Server error');
    }

    const status = await response.json();
    lastKnownStatus = status;

    // Notify all YouTube tabs about status change
    notifyYouTubeTabs();

    return status;
  } catch (error) {
    console.log('Claude Focus Guard: Server not reachable');
    lastKnownStatus = { isActive: false, serverOffline: true };
    return lastKnownStatus;
  }
}

/**
 * Notify all YouTube tabs to check their status
 */
async function notifyYouTubeTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });

    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_STATUS' });
      } catch (e) {
        // Tab might not have content script loaded yet
      }
    }
  } catch (error) {
    console.error('Failed to notify tabs:', error);
  }
}

/**
 * Set up periodic alarm for status checks
 */
function setupAlarm() {
  chrome.alarms.create('checkStatus', {
    periodInMinutes: CHECK_INTERVAL_MINUTES
  });
}

// Handle alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkStatus') {
    checkClaudeStatus();
  }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    checkClaudeStatus().then(sendResponse);
    return true; // Will respond asynchronously
  }

  if (message.type === 'SETTINGS_CHANGED') {
    notifyYouTubeTabs();
  }
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Claude Focus Guard installed/updated:', details.reason);

  // Set default settings
  chrome.storage.local.get(['blockingEnabled'], (result) => {
    if (result.blockingEnabled === undefined) {
      chrome.storage.local.set({ blockingEnabled: true });
    }
  });

  // Setup alarm
  setupAlarm();

  // Initial status check
  checkClaudeStatus();
});

// Handle service worker startup
chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
  checkClaudeStatus();
});

// Initial setup when service worker loads
setupAlarm();
checkClaudeStatus();
