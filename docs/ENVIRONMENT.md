# Environment Setup — Complete Replication Guide

> Exact steps to recreate this development environment on a new machine.
> Last verified: 2026-03-09 on macOS Sequoia (Darwin 24.6.0, arm64).

## Hardware

| Component | Current | Minimum |
|-----------|---------|---------|
| Machine | MacBook Pro M2 Max | Any Apple Silicon Mac |
| RAM | 32GB+ | 16GB |
| Storage | 1TB+ SSD | 50GB free |
| Microphone | Built-in | Any (for Jarvis voice) |
| Network | Wi-Fi + iPhone on same LAN | Required for phone access |

## 1. System Prerequisites

```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js (v24+)
brew install node

# Install sox (audio recording for Jarvis voice)
brew install sox

# Install git
brew install git

# Verify
node -v    # v24.10.0
npm -v     # 11.6.0
sox --version
git --version
```

## 2. Claude Code (The Orchestrator)

Claude Code is the AI coding assistant that orchestrates everything. It runs in the terminal.

```bash
# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Verify
claude --version    # 2.1.49+

# Configure (interactive — sets up API key)
claude

# Claude Code lives at:
#   Binary: /opt/homebrew/bin/claude
#   Config: ~/.claude/settings.json
#   Memory: ~/.claude/projects/<project>/memory/MEMORY.md
#   Projects: ~/.claude/projects/
```

### Claude Code Configuration

Claude Code reads directives from:
1. `~/.claude/settings.json` — global settings (statusline, permissions)
2. `~/CLAUDE.md` — global agent rules (loaded on-demand)
3. `<project>/CLAUDE.md` — project-specific rules (always loaded)
4. `~/.claude/projects/<project>/memory/MEMORY.md` — persistent memory across sessions

The CLAUDE.md in this repo contains all Jarvis personality, capability directives,
enforcement levels, and coding standards.

## 3. Clone & Install

```bash
# Clone the XRAI spatial web repo
cd ~/Applications
git clone https://github.com/JT5D/xrai-spatial-web.git web-scraper
cd web-scraper

# Install dependencies
npm install

# Install Playwright browsers (for E2E testing)
npx playwright install chromium webkit
```

## 4. Environment Variables

Create `.env` in project root (NEVER commit this file):

```bash
# Required — Jarvis voice + LLM
GROQ_API_KEY=gsk_...          # Get from https://console.groq.com

# Recommended — fallback LLM
GEMINI_API_KEY=AIza...         # Get from https://aistudio.google.com

# Optional — premium features
ANTHROPIC_API_KEY=sk-ant-...   # Claude fallback (paid)
ELEVENLABS_API_KEY=...         # Premium TTS voices (paid)

# Optional — override defaults
# PREFER_CLAUDE=1              # Use Claude as primary LLM
# JARVIS_MODEL=llama-3.3-70b   # Override Groq model
# OLLAMA_MODEL=llama3.1:latest # Override Ollama model
```

## 5. Start Everything

```bash
# Start the web server (port 3210)
node scrape.mjs --serve

# In another terminal: start Jarvis daemon
node src/daemon/jarvis-supervisor.mjs

# Install always-on keepalive (survives reboot/sleep)
bash scripts/install-launchd.sh
```

### Verify

```bash
# Health check
curl http://localhost:3210/health

# Run tests
node --test test/*.test.mjs              # 145 unit tests
npx playwright test --project=chromium    # 35 E2E tests

# Open in browser
open http://localhost:3210/spatial        # 3D spatial viewer
open http://localhost:3210/dashboard      # Agent monitor
```

## 6. Access from Phone

The server binds to `0.0.0.0:3210`, so any device on the same network can access it:

```
http://<mac-ip>:3210/spatial      # Spatial viewer
http://<mac-ip>:3210/dashboard    # Agent dashboard
http://<mac-ip>:3210/health       # Quick health check
```

Find your Mac's IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`

## 7. Process Architecture

After full setup, these processes run:

```
launchd
  └── jarvis-keepalive.mjs (PID auto, launchd managed)
        ├── watches: jarvis-supervisor.mjs → restarts if dead
        ├── watches: scrape.mjs --serve → restarts if dead
        └── watches: caffeinate → restarts if dead

jarvis-supervisor.mjs
  └── jarvis-listen.mjs (voice daemon)
        ├── sox (microphone recording)
        ├── Groq Whisper (STT)
        ├── LLM (Groq → Gemini → Ollama → Claude)
        └── Edge TTS (speech output)

scrape.mjs --serve
  ├── HTTP server (:3210)
  ├── WebSocket /agent/ws (browser Jarvis)
  └── WebSocket /rooms (multiplayer)
```

## 8. Logs & Debugging

| Log | Location | Purpose |
|-----|----------|---------|
| Server | `/tmp/jarvis-daemon/server.log` | HTTP server stdout |
| Keepalive | `/tmp/jarvis-daemon/keepalive.log` | Watchdog activity |
| Keepalive stdout | `/tmp/jarvis-daemon/keepalive-stdout.log` | launchd stdout |
| Keepalive stderr | `/tmp/jarvis-daemon/keepalive-stderr.log` | launchd stderr |
| Activity | `/tmp/jarvis-daemon/activity-log.jsonl` | Agent actions |
| Shared memory | `/tmp/jarvis-daemon/shared-memory.json` | Agent coordination |

## 9. Uninstall

```bash
# Stop keepalive
bash scripts/install-launchd.sh --uninstall

# Kill processes
pkill -f jarvis-supervisor
pkill -f jarvis-listen
pkill -f "scrape.mjs --serve"
pkill -f caffeinate

# Clean up
rm -rf /tmp/jarvis-daemon
```

---

# Fault Resistance & Optimization Plan

## Current Weaknesses

| Issue | Impact | Severity |
|-------|--------|----------|
| Mac sleeps with lid closed | All processes pause | Medium |
| Phone battery dies | Claude Code session ends | **High** |
| Power outage | Everything stops | High |
| Network drops | No Groq/Gemini API access | Medium |
| Groq daily limit (100K TPD) | Jarvis degrades to Gemini | Low |

## Planned Improvements

### Phase 1: Survive Phone Death (Priority)

The phone is just an SSH terminal to the Mac. Claude Code runs ON the Mac,
not on the phone. When the phone dies:

- **What survives**: Everything. Server, Jarvis daemon, keepalive all run
  on the Mac via launchd/nohup. They don't need the phone.
- **What dies**: The Claude Code interactive session (the terminal).
- **Fix**: Run Claude Code in `screen` or `tmux` so it persists:

```bash
# Install tmux
brew install tmux

# Start Claude Code in tmux
tmux new-session -s claude
claude

# Detach: Ctrl-B then D
# Reattach from phone: tmux attach -t claude
```

With tmux, Claude Code survives phone disconnects. Resume from any device.

### Phase 2: Survive Mac Sleep

```bash
# Already handled: caffeinate -dims keeps Mac awake
# Additional: prevent lid-close sleep
sudo pmset -a lidwake 1
sudo pmset -a disablesleep 1    # WARNING: Mac never sleeps
# Or: use a clamshell setup with external monitor
```

### Phase 3: Cloud Fallback (Survive Everything)

For true 24/7 uptime independent of any single device:

1. **VPS/Cloud server** (e.g., Hetzner ARM, $4/mo)
   - Run Jarvis server + daemon there
   - Accessible from anywhere, not just LAN
   - Survives all local failures

2. **GitHub Actions scheduled workflows**
   - Run health checks every 5 min
   - Auto-restart cloud server if down

3. **Tailscale/WireGuard VPN**
   - Secure access from phone/laptop to cloud server
   - No port forwarding needed

### Phase 4: Multi-Device Agent Mesh

```
Phone (Blink/Termius) ──SSH──┐
                              ▼
Laptop (Mac) ──────────── tmux session (Claude Code)
  │                           │
  ├── Jarvis daemon           │
  ├── Web server              │
  └── Keepalive               │
                              ▼
Cloud VPS (backup) ──── Mirror of Jarvis + server
  └── Accessible if Mac is offline
```

## Security Checklist

- [x] `.env` in `.gitignore` — never committed
- [x] All API keys from `process.env` — no hardcoded secrets
- [x] Screenshots contain only UI, no personal data
- [x] `.gitignore` covers: `.env`, `*.key`, `*.pem`, `credentials*`, `test-results/`, `playwright-report/`
- [x] Git remote is HTTPS (no SSH key in repo)
- [x] No `--force` pushes to master
- [ ] TODO: Add `git-secrets` pre-commit hook for automated scanning
- [ ] TODO: Rotate API keys periodically
