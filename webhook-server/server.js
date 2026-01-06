/**
 * Claude Focus Guard - Webhook Server
 *
 * This server receives hook events from Claude Code and tracks whether
 * Claude is actively working on a task. The Chrome extension polls this
 * server to determine if YouTube should be blocked.
 */

const http = require('http');

const PORT = 8765;

// State tracking
let state = {
  isActive: false,
  lastActivity: null,
  currentSession: null,
  activeTasks: new Map(), // Track active Task tool uses by tool_use_id
  activityHistory: []
};

// Timeout for considering Claude "inactive" (in ms)
// If no activity for 2 minutes, consider inactive
const INACTIVITY_TIMEOUT = 2 * 60 * 1000;

/**
 * Update the active state based on an incoming hook event
 */
function handleHookEvent(event) {
  const timestamp = new Date().toISOString();

  // Log the event
  console.log(`[${timestamp}] Received event:`, event.event || event.hook_event_name);

  // Add to history (keep last 50 events)
  state.activityHistory.unshift({ ...event, receivedAt: timestamp });
  if (state.activityHistory.length > 50) {
    state.activityHistory.pop();
  }

  const eventType = event.event || event.hook_event_name;

  switch (eventType) {
    case 'session_start':
    case 'SessionStart':
      state.currentSession = event.session_id || 'active';
      state.isActive = true;
      state.lastActivity = Date.now();
      console.log('  → Session started, Claude is ACTIVE');
      break;

    case 'session_end':
    case 'SessionEnd':
      state.currentSession = null;
      state.isActive = false;
      state.activeTasks.clear();
      console.log('  → Session ended, Claude is INACTIVE');
      break;

    case 'task_start':
    case 'PreToolUse':
      // Track task start
      if (event.tool_use_id) {
        state.activeTasks.set(event.tool_use_id, {
          startedAt: Date.now(),
          toolName: event.tool_name
        });
      }
      state.isActive = true;
      state.lastActivity = Date.now();
      console.log(`  → Task started (${state.activeTasks.size} active), Claude is ACTIVE`);
      break;

    case 'task_end':
    case 'PostToolUse':
      // Track task completion
      if (event.tool_use_id) {
        state.activeTasks.delete(event.tool_use_id);
      }
      state.lastActivity = Date.now();
      // Still active if there are other tasks running
      state.isActive = state.activeTasks.size > 0 || state.currentSession !== null;
      console.log(`  → Task ended (${state.activeTasks.size} remaining)`);
      break;

    case 'stop':
    case 'Stop':
    case 'SubagentStop':
      // Claude finished responding - still in session but not actively working
      state.lastActivity = Date.now();
      // Don't immediately mark inactive, give some grace period
      console.log('  → Claude stopped responding, checking for timeout...');
      break;

    case 'heartbeat':
      // Extension can send heartbeats to check status
      state.lastActivity = Date.now();
      break;

    default:
      // Any other activity counts as activity
      state.lastActivity = Date.now();
      console.log(`  → Unknown event type: ${eventType}`);
  }
}

/**
 * Check if Claude should be considered active
 */
function isClaudeActive() {
  // If no session, definitely inactive
  if (!state.currentSession && state.activeTasks.size === 0) {
    return false;
  }

  // If there are active tasks, definitely active
  if (state.activeTasks.size > 0) {
    return true;
  }

  // Check timeout - if last activity was within timeout period, still active
  if (state.lastActivity) {
    const timeSinceActivity = Date.now() - state.lastActivity;
    if (timeSinceActivity < INACTIVITY_TIMEOUT) {
      return true;
    }
  }

  return false;
}

/**
 * Get current status for the Chrome extension
 */
function getStatus() {
  const active = isClaudeActive();
  return {
    isActive: active,
    lastActivity: state.lastActivity,
    currentSession: state.currentSession,
    activeTaskCount: state.activeTasks.size,
    timeSinceActivity: state.lastActivity ? Date.now() - state.lastActivity : null,
    inactivityTimeout: INACTIVITY_TIMEOUT
  };
}

// Create HTTP server
const server = http.createServer((req, res) => {
  // Enable CORS for Chrome extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /hook - Receive hook events from Claude Code
  if (req.method === 'POST' && req.url === '/hook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        handleHookEvent(event);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        console.error('Failed to parse hook event:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /status - Check if Claude is active (for Chrome extension)
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getStatus()));
    return;
  }

  // GET /history - Get recent event history (for debugging)
  if (req.method === 'GET' && req.url === '/history') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state.activityHistory));
    return;
  }

  // POST /simulate - Simulate events for testing
  if (req.method === 'POST' && req.url === '/simulate') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { action } = JSON.parse(body);
        if (action === 'start') {
          handleHookEvent({ event: 'session_start', session_id: 'test-session' });
        } else if (action === 'stop') {
          handleHookEvent({ event: 'session_end' });
        } else if (action === 'task_start') {
          handleHookEvent({ event: 'task_start', tool_use_id: `task-${Date.now()}` });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: getStatus() }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  // Default: 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Claude Focus Guard - Webhook Server                ║
╠══════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                    ║
║                                                              ║
║  Endpoints:                                                  ║
║    POST /hook    - Receive Claude Code hook events           ║
║    GET  /status  - Check if Claude is active                 ║
║    GET  /history - View recent events (debug)                ║
║    POST /simulate - Simulate events for testing              ║
║                                                              ║
║  Inactivity timeout: ${INACTIVITY_TIMEOUT / 1000 / 60} minutes                             ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
