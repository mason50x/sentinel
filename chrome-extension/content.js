/**
 * Sentinel - Content Script
 * Runs on YouTube pages to show blocking overlay when Claude is inactive
 */

const SERVER_URL = 'http://localhost:8765';
const CHECK_INTERVAL = 1000; // Check every 1 second for responsive blocking

let overlay = null;
let isBlocked = false;
let checkInterval = null;

/**
 * Create the blocking overlay
 */
function createOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'claude-focus-guard-overlay';
  overlay.innerHTML = `
    <div class="cfg-content">
      <div class="cfg-logo">🛡️</div>
      <h1 class="cfg-title">YouTube Blocked</h1>
      <p class="cfg-message">Claude Code is not currently active.</p>
      <p class="cfg-submessage">Start a Claude Code session to unlock YouTube.</p>
      <div class="cfg-status">
        <div class="cfg-status-dot"></div>
        <span>Waiting for Claude...</span>
      </div>
      <button class="cfg-bypass-btn" id="cfg-bypass-btn">
        I need to watch something important (5 min bypass)
      </button>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  // Add bypass button handler
  const bypassBtn = document.getElementById('cfg-bypass-btn');
  if (bypassBtn) {
    bypassBtn.addEventListener('click', handleBypass);
  }

  return overlay;
}

/**
 * Show the blocking overlay
 */
function showOverlay() {
  if (!overlay) {
    createOverlay();
  }
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
  isBlocked = true;
}

/**
 * Hide the blocking overlay
 */
function hideOverlay() {
  if (overlay) {
    overlay.classList.remove('visible');
  }
  document.body.style.overflow = '';
  isBlocked = false;
}

/**
 * Handle bypass button click
 */
function handleBypass() {
  const bypassUntil = Date.now() + (5 * 60 * 1000); // 5 minutes
  chrome.storage.local.set({ bypassUntil });
  hideOverlay();
}

/**
 * Check if Claude is active and update overlay accordingly
 */
async function checkStatus() {
  try {
    // First check if blocking is enabled and not bypassed
    const storage = await chrome.storage.local.get(['blockingEnabled', 'bypassUntil']);

    // If blocking is disabled, don't block
    if (storage.blockingEnabled === false) {
      hideOverlay();
      return;
    }

    // If bypass is active, don't block
    if (storage.bypassUntil && Date.now() < storage.bypassUntil) {
      hideOverlay();
      return;
    }

    // Clear expired bypass
    if (storage.bypassUntil && Date.now() >= storage.bypassUntil) {
      chrome.storage.local.remove('bypassUntil');
    }

    // Check server status
    const response = await fetch(`${SERVER_URL}/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Server error');
    }

    const status = await response.json();

    if (status.isActive) {
      hideOverlay();
    } else {
      showOverlay();
    }
  } catch (error) {
    // If server is not running, block by default (fail-safe)
    console.log('Sentinel: Server not reachable, blocking YouTube');
    showOverlay();

    // Update overlay message for server error
    if (overlay) {
      const message = overlay.querySelector('.cfg-message');
      if (message) {
        message.textContent = 'Cannot connect to Sentinel server.';
      }
      const submessage = overlay.querySelector('.cfg-submessage');
      if (submessage) {
        submessage.textContent = 'Start the webhook server or disable the extension.';
      }
    }
  }
}

/**
 * Initialize the content script
 */
function init() {
  // Initial check
  checkStatus();

  // Set up periodic checking
  checkInterval = setInterval(checkStatus, CHECK_INTERVAL);

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CHECK_STATUS') {
      checkStatus();
    } else if (message.type === 'FORCE_BLOCK') {
      showOverlay();
    } else if (message.type === 'FORCE_UNBLOCK') {
      hideOverlay();
    }
  });

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    if (checkInterval) {
      clearInterval(checkInterval);
    }
  });
}

// Start the content script
init();
