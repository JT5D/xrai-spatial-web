#!/bin/bash
# Install Jarvis Keep-Alive as a macOS launchd service.
# This ensures Jarvis + web server auto-start on boot and survive sleep/wake.
#
# Usage: bash scripts/install-launchd.sh
# Uninstall: bash scripts/install-launchd.sh --uninstall

PLIST_NAME="com.xrai.jarvis-keepalive"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_PATH="$(which node)"
KEEPALIVE_SCRIPT="${PROJECT_DIR}/src/daemon/jarvis-keepalive.mjs"
LOG_DIR="/tmp/jarvis-daemon"

if [ "$1" = "--uninstall" ]; then
  echo "Uninstalling ${PLIST_NAME}..."
  launchctl unload "$PLIST_PATH" 2>/dev/null
  rm -f "$PLIST_PATH"
  echo "Done. Jarvis keep-alive service removed."
  exit 0
fi

echo "Installing Jarvis Keep-Alive as launchd service..."
echo "  Project: ${PROJECT_DIR}"
echo "  Node:    ${NODE_PATH}"
echo "  Script:  ${KEEPALIVE_SCRIPT}"

mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${KEEPALIVE_SCRIPT}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/keepalive-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/keepalive-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$(dirname "$NODE_PATH")</string>
        <key>HOME</key>
        <string>${HOME}</string>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
PLIST

# Load the service
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo ""
echo "✓ Installed and loaded: ${PLIST_NAME}"
echo "  Plist:  ${PLIST_PATH}"
echo "  Logs:   ${LOG_DIR}/keepalive-*.log"
echo ""
echo "  Check status: launchctl list | grep jarvis"
echo "  Uninstall:    bash scripts/install-launchd.sh --uninstall"
