# Developer Agent - Voice Agent Project

## Quick Reference

**Project:** voice.artgenies.com  
**Location:** `/Users/obiwon/.openclaw/agents/developer/workspace/`  
**Model:** Pony Alpha (200K context, free, logged)  

## Architecture

### Backend (Node.js)
```
server.js          - Main Express server (port 3003)
├── /chat          - Text chat endpoint
├── /chat-voice    - Voice chat endpoint  
├── /transcribe    - Audio transcription
├── /dashboard     - Dashboard HTML
├── /stats         - Usage statistics
└── /health        - Health check
```

### Frontend
```
index.html         - Main UI (glassmorphism design)
app.js             - Voice handling, Web Speech API
dashboard.html     - Cost tracking & metrics
Obiwon-portrait-wise.jpeg - Avatar image
```

### Key Technologies
- **AI:** Gemini 2.0 Flash (chat + transcription)
- **TTS:** Browser TTS + Kokoro TTS (local)
- **STT:** Web Speech API (browser) + Gemini (fallback)
- **Design:** Glassmorphism CSS, Tailwind-like styling

## Common Tasks

### Add API Endpoint
1. Check existing endpoints in server.js
2. Add route handler
3. Test with curl

### Update Dashboard
1. Edit dashboard.html
2. Maintain glassmorphism design
3. Update JavaScript for new data

### Fix Voice Issues
1. Check server logs
2. Verify API key status
3. Test in Brave (Chrome has issues)

### Frontend Changes
1. Edit index.html or app.js
2. Test voice recording
3. Verify TTS works

## File Structure

```
workspace/
├── server.js              # Main backend
├── app.js                 # Frontend logic
├── index.html             # Main page
├── dashboard.html         # Stats dashboard
├── package.json           # Dependencies
├── server.log             # Runtime logs
├── node_modules/          # NPM packages
├── README.md              # Documentation
├── SKILL.md               # OpenClaw skill docs
├── TEMPLATE.md            # Reuse template
└── [backup files]         # Old versions
```

## Security Rules

❌ **NEVER:**
- Access .env files
- Expose API keys in code
- Log sensitive credentials
- Share token files

✅ **ALWAYS:**
- Use environment variables
- Keep secrets out of git
- Test error handling
- Clean up temp files

## Testing

### Test Voice
```bash
# Start server
cd /Users/obiwon/.openclaw/agents/developer/workspace
node server.js

# Check health
curl http://localhost:3003/health

# Test chat
curl -X POST -H "Content-Type: application/json" \
  -d '{"message":"Hello"}' \
  http://localhost:3003/chat
```

### Test in Browser
1. Open https://voice.artgenies.com
2. Use Brave browser (Chrome has permission issues)
3. Allow microphone access
4. Test voice recording

## Costs

- **Gemini API:** ~$0.0013 per query
- **TTS (Kokoro):** $0 (local)
- **STT (Web Speech):** $0 (browser)
- **Exa Search:** $0.005 per search

## Useful Commands

```bash
# Check server status
curl http://localhost:3003/health

# View logs
tail -f server.log

# Restart server
pkill -f "node server.js"
node server.js

# Check disk usage
du -sh .
```

## Documentation

- Main README: `/workspace/README.md`
- Skill Docs: `/workspace/SKILL.md`
- Template: `/workspace/TEMPLATE.md`
- This file: `/agents/developer/TOOLS.md`
