#!/bin/bash
# Quick start script for Innovation 5.0 Voice Agent
# Usage: ./quick-start.sh

echo "🎙️ Starting Innovation 5.0 Voice Agent"
echo "======================================"

# Check if server is already running
if lsof -Pi :3004 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "✅ Server already running on port 3004"
else
    echo "🚀 Starting server on port 3004..."
    cd /Users/obiwon/.openclaw/workspace/skills/voice-agent-innovation5
    nohup node server.js > server.log 2>&1 &
    sleep 3
    
    if curl -s http://localhost:3004/health > /dev/null; then
        echo "✅ Server started successfully"
    else
        echo "❌ Server failed to start. Check server.log"
        exit 1
    fi
fi

# Check if tunnel is already running
if pgrep -f "cloudflared.*voice1" > /dev/null; then
    echo "✅ Cloudflare tunnel already running"
else
    echo "🌐 Starting Cloudflare tunnel..."
    nohup cloudflared tunnel --config ~/.cloudflared/voice1.yml run > /tmp/voice1-tunnel.log 2>&1 &
    sleep 5
    echo "✅ Tunnel started"
fi

echo ""
echo "🎉 Innovation 5.0 Voice Agent is ready!"
echo ""
echo "Local:   http://localhost:3004"
echo "Public:  https://voice1.artgenies.com"
echo ""
echo "To stop: pkill -f 'node server.js' && pkill -f 'cloudflared.*voice1'"
