# Sentinel

A Chrome extension that blocks YouTube unless Claude Code is actively working on a task. Stay focused while Claude does the heavy lifting!

## How It Works

```
┌─────────────────┐     hooks      ┌─────────────────┐     polling     ┌─────────────────┐
│   Claude Code   │ ──────────────▶│  Webhook Server │◀────────────────│ Chrome Extension│
│   (CLI/VSCode)  │                │  (localhost)    │                 │  (YouTube tabs) │
└─────────────────┘                └─────────────────┘                 └─────────────────┘
                                          │
                                          │ tracks activity
                                          ▼
                                   ┌─────────────────┐
                                   │  Active State   │
                                   │  - Sessions     │
                                   │  - Tool uses    │
                                   │  - Timeouts     │
                                   └─────────────────┘
```

1. **Claude Code Hooks** fire events when Claude starts/stops sessions and uses tools
2. **Webhook Server** receives these events and tracks Claude's activity state
3. **Chrome Extension** polls the server and blocks YouTube when Claude is inactive

## Installation

### Step 1: Configure Claude Code Hooks

Add the hooks configuration to your Claude Code settings:

**Option A: User-level settings** (recommended)
```bash
# Open your Claude settings file
# macOS/Linux: ~/.claude/settings.json
# Windows: %USERPROFILE%\.claude\settings.json

# Merge the contents of claude-hooks-config.json into your settings
```

**Option B: Project-level settings**
```bash
# Copy to your project's .claude/settings.json
cp claude-hooks-config.json /path/to/your/project/.claude/settings.json
```

The hooks configuration (`claude-hooks-config.json`) sends HTTP POST requests to the local webhook server whenever Claude:
- Starts or ends a session
- Begins or finishes using tools (Task, Bash, Edit, Write)

### Step 2: Start the Webhook Server

```bash
cd webhook-server
npm start
```

You should see:
```
╔══════════════════════════════════════════════════════════════╗
║           Sentinel - Webhook Server                ║
╠══════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:8765                     ║
║                                                              ║
║  Endpoints:                                                  ║
║    POST /hook    - Receive Claude Code hook events           ║
║    GET  /status  - Check if Claude is active                 ║
║    GET  /history - View recent events (debug)                ║
║    POST /simulate - Simulate events for testing              ║
║                                                              ║
║  Inactivity timeout: 2 minutes                               ║
╚══════════════════════════════════════════════════════════════╝
```

**Keep this running in the background** while you want the blocking to work.

### Step 3: Install the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder
5. The extension icon should appear in your toolbar

## Usage

### Extension Popup

Click the extension icon to see:
- **Claude Status**: Whether Claude is currently active
- **Active Tasks**: Number of tools currently running
- **Last Activity**: Time since last Claude activity
- **YouTube Status**: Whether YouTube is blocked or allowed

### Settings

- **Enable Blocking**: Toggle to enable/disable the YouTube blocker
- **Test Mode**: Simulate Claude being active/inactive for testing

### Bypass

If you need to access YouTube while Claude is inactive, click the **"I need to watch something important"** button on the block screen for a 5-minute bypass.

## Configuration

### Inactivity Timeout

By default, Claude is considered "inactive" after 2 minutes of no activity. To change this, edit `webhook-server/server.js`:

```javascript
const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // Change to desired ms
```

### Tracked Tools

The hooks configuration tracks these tools by default:
- `Task` - Subagent tasks
- `Bash` - Shell commands
- `Edit` - File edits
- `Write` - File writes

To track more tools, add additional entries to `PreToolUse` and `PostToolUse` in the hooks config.

## Troubleshooting

### "Server not running" error

Make sure the webhook server is running:
```bash
cd webhook-server && npm start
```

### YouTube not blocking

1. Check that the extension is enabled in `chrome://extensions/`
2. Verify the webhook server is running
3. Check the server console for incoming hook events
4. Try the test mode in the extension popup

### Hooks not firing

1. Verify your Claude settings file is in the correct location
2. Check that the JSON syntax is valid
3. Restart Claude Code after changing settings

### Debug mode

Visit `http://localhost:8765/history` in your browser to see recent hook events.

## Project Structure

```
claudeex/
├── chrome-extension/
│   ├── manifest.json      # Extension configuration
│   ├── background.js      # Service worker
│   ├── content.js         # YouTube page script
│   ├── block-overlay.css  # Blocking UI styles
│   ├── popup.html         # Extension popup
│   ├── popup.js           # Popup logic
│   └── icons/             # Extension icons
├── webhook-server/
│   ├── package.json
│   └── server.js          # Webhook receiver
├── claude-hooks-config.json   # Claude Code hooks
└── README.md
```

## Auto-start Server (Optional)

To have the webhook server start automatically:

### macOS (launchd)

Create `~/Library/LaunchAgents/com.claude-focus-guard.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude-focus-guard</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/webhook-server/server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Then load it:
```bash
launchctl load ~/Library/LaunchAgents/com.claude-focus-guard.plist
```

### Linux (systemd)

Create `~/.config/systemd/user/claude-focus-guard.service`:
```ini
[Unit]
Description=Sentinel Webhook Server

[Service]
ExecStart=/usr/bin/node /path/to/webhook-server/server.js
Restart=always

[Install]
WantedBy=default.target
```

Then enable it:
```bash
systemctl --user enable claude-focus-guard
systemctl --user start claude-focus-guard
```

## License

MIT
