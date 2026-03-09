#!/bin/bash
# Start Claude Code inside a tmux session so it survives terminal disconnects.
# Usage: bash scripts/start-claude-tmux.sh [project-dir]
#
# From phone: ssh into Mac, run this script, then safely close Terminus.
# To reconnect: ssh back, then: tmux attach -t claude
#
# The tmux session named "claude" persists independently of SSH connections.

PROJECT_DIR="${1:-/Users/jamestunick/Applications/web-scraper}"
SESSION_NAME="claude"

# Check if tmux session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Session '$SESSION_NAME' already running. Attaching..."
    tmux attach -t "$SESSION_NAME"
    exit 0
fi

# Create new tmux session with Claude Code
tmux new-session -d -s "$SESSION_NAME" -c "$PROJECT_DIR"

# Window 0: Claude Code
tmux rename-window -t "$SESSION_NAME:0" "claude"
tmux send-keys -t "$SESSION_NAME:0" "cd $PROJECT_DIR && claude" C-m

# Window 1: Server logs (optional, for monitoring)
tmux new-window -t "$SESSION_NAME" -n "server"
tmux send-keys -t "$SESSION_NAME:1" "tail -f /tmp/xrai-server-debug*.log 2>/dev/null || echo 'No server logs yet'" C-m

# Window 2: Shell (for manual commands)
tmux new-window -t "$SESSION_NAME" -n "shell"
tmux send-keys -t "$SESSION_NAME:2" "cd $PROJECT_DIR" C-m

# Select Claude window and attach
tmux select-window -t "$SESSION_NAME:0"
tmux attach -t "$SESSION_NAME"
