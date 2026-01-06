/**
 * Sentinel - Popup Script
 */

const SERVER_URL = 'http://localhost:8765';

// DOM Elements
const serverError = document.getElementById('server-error');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const taskCount = document.getElementById('task-count');
const lastActivity = document.getElementById('last-activity');
const sessionStatus = document.getElementById('session-status');
const blockingIcon = document.getElementById('blocking-icon');
const blockingText = document.getElementById('blocking-text');
const enableToggle = document.getElementById('enable-toggle');
const testToggle = document.getElementById('test-toggle');
const testControls = document.getElementById('test-controls');
const testStart = document.getElementById('test-start');
const testStop = document.getElementById('test-stop');

/**
 * Format time ago string
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Never';

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Update the UI with current status
 */
function updateUI(status, serverConnected = true) {
  if (!serverConnected) {
    serverError.style.display = 'block';
    statusDot.className = 'status-dot error';
    statusText.className = 'status-text error';
    statusText.textContent = 'Server Offline';
    blockingIcon.textContent = '⚠️';
    blockingText.className = 'blocking-text';
    blockingText.textContent = 'Server Required';
    return;
  }

  serverError.style.display = 'none';

  const isActive = status.isActive;

  // Update status indicator
  statusDot.className = `status-dot ${isActive ? 'active' : 'inactive'}`;
  statusText.className = `status-text ${isActive ? 'active' : 'inactive'}`;
  statusText.textContent = isActive ? 'Active' : 'Inactive';

  // Update info
  taskCount.textContent = status.activeTaskCount || 0;
  lastActivity.textContent = formatTimeAgo(status.lastActivity);
  sessionStatus.textContent = status.currentSession ? 'Connected' : 'None';

  // Update blocking status based on enabled state
  chrome.storage.local.get(['blockingEnabled'], (result) => {
    const blockingEnabled = result.blockingEnabled !== false;

    if (!blockingEnabled) {
      blockingIcon.textContent = '🔓';
      blockingText.className = 'blocking-text allowed';
      blockingText.textContent = 'Blocking Disabled';
    } else if (isActive) {
      blockingIcon.textContent = '🔓';
      blockingText.className = 'blocking-text allowed';
      blockingText.textContent = 'YouTube Allowed';
    } else {
      blockingIcon.textContent = '🔒';
      blockingText.className = 'blocking-text blocked';
      blockingText.textContent = 'YouTube Blocked';
    }
  });
}

/**
 * Fetch status from server
 */
async function fetchStatus() {
  try {
    const response = await fetch(`${SERVER_URL}/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error('Server error');

    const status = await response.json();
    updateUI(status, true);
  } catch (error) {
    console.error('Failed to fetch status:', error);
    updateUI({}, false);
  }
}

/**
 * Simulate server action (for testing)
 */
async function simulateAction(action) {
  try {
    await fetch(`${SERVER_URL}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    await fetchStatus();
  } catch (error) {
    console.error('Failed to simulate:', error);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  chrome.storage.local.get(['blockingEnabled'], (result) => {
    enableToggle.checked = result.blockingEnabled !== false;
  });

  // Fetch initial status
  fetchStatus();

  // Poll every 1 second for responsive UI
  setInterval(fetchStatus, 1000);
});

// Enable/disable toggle
enableToggle.addEventListener('change', (e) => {
  chrome.storage.local.set({ blockingEnabled: e.target.checked });
  // Notify background script
  chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED' });
  fetchStatus();
});

// Test mode toggle
testToggle.addEventListener('change', (e) => {
  testControls.style.display = e.target.checked ? 'flex' : 'none';
});

// Test buttons
testStart.addEventListener('click', () => simulateAction('start'));
testStop.addEventListener('click', () => simulateAction('stop'));
