#!/bin/bash
# Voice Agent Health Monitor
# Checks if voice.artgenies.com is working properly
# If failed, spawns developer agent to fix it

HEALTH_URL="http://localhost:3003/health"
CHAT_URL="http://localhost:3003/chat"
LOG_FILE="/Users/obiwon/.openclaw/workspace/logs/voice-health-check.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Ensure log directory exists
mkdir -p $(dirname $LOG_FILE)

echo "[$DATE] Starting voice agent health check..." >> $LOG_FILE

# Check 1: Health endpoint
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL 2>/dev/null)

if [ "$HEALTH_STATUS" != "200" ]; then
    echo "[$DATE] ❌ HEALTH CHECK FAILED - Status: $HEALTH_STATUS" >> $LOG_FILE
    
    # Check if server process is running
    SERVER_PID=$(pgrep -f "node server.js")
    if [ -z "$SERVER_PID" ]; then
        echo "[$DATE] ⚠️  Server process not running - attempting restart..." >> $LOG_FILE
        
        # Try to restart server
        cd /Users/obiwon/.openclaw/workspace/skills/voice-agent
        nohup node server.js > server.log 2>&1 &
        sleep 5
        
        # Check if restart worked
        NEW_PID=$(pgrep -f "node server.js")
        if [ -n "$NEW_PID" ]; then
            echo "[$DATE] ✅ Server restarted successfully (PID: $NEW_PID)" >> $LOG_FILE
        else
            echo "[$DATE] 🚨 Server restart failed - spawning developer agent..." >> $LOG_FILE
            
            # Create task file for developer agent
            TASK="URGENT: Voice agent server at voice.artgenies.com is down and automatic restart failed.

INVESTIGATE:
1. Check /Users/obiwon/.openclaw/workspace/skills/voice-agent/server.log for errors
2. Check if port 3003 is in use: lsof -i :3003
3. Check if .env file exists and has valid GEMINI_API_KEY
4. Check for any syntax errors in server.js

FIX:
1. Fix any issues found
2. Restart the server
3. Verify health endpoint responds: curl http://localhost:3003/health
4. Test chat endpoint: curl -X POST -H 'Content-Type: application/json' -d '{\"message\":\"test\"}' http://localhost:3003/chat

Report what was wrong and how you fixed it."

            echo "$TASK" > /Users/obiwon/.openclaw/workspace/logs/voice-agent-repair-task.txt
            
            # Spawn developer agent via system event
            echo "[$DATE] 📨 Developer agent task created at: /Users/obiwon/.openclaw/workspace/logs/voice-agent-repair-task.txt" >> $LOG_FILE
            echo "[$DATE] 🔔 ALERT: Tell Obiwon to 'spawn developer agent to fix voice server'" >> $LOG_FILE
            
            # Send notification via Telegram (if configured)
            echo "🚨 Voice Agent DOWN - Manual intervention or dev-agent needed" | wall 2>/dev/null
        fi
    else
        echo "[$DATE] ⚠️  Server running (PID: $SERVER_PID) but health check failing" >> $LOG_FILE
        echo "[$DATE] 🔔 ALERT: Server process exists but not responding - may need dev-agent investigation" >> $LOG_FILE
    fi
    
    exit 1
fi

# Check 2: Chat functionality
CHAT_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d '{"message":"health check"}' $CHAT_URL 2>/dev/null)

if [ -z "$CHAT_RESPONSE" ] || [[ "$CHAT_RESPONSE" == *"error"* ]]; then
    echo "[$DATE] ⚠️  Health OK but chat endpoint failing" >> $LOG_FILE
    echo "[$DATE] Response: $CHAT_RESPONSE" >> $LOG_FILE
    echo "[$DATE] 🔔 May need investigation - Gemini API key issue?" >> $LOG_FILE
    exit 1
fi

# All checks passed
echo "[$DATE] ✅ Voice agent healthy - Health: $HEALTH_STATUS, Chat: OK" >> $LOG_FILE
exit 0
