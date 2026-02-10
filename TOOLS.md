# Developer Agent Tools & Skills

## Project: voice.artgenies.com

**Location:** `/Users/obiwon/.openclaw/agents/developer/workspace/`

**Description:** Voice-enabled AI tutor for ESMOD Creative Tech class

## Key Files

### Backend (Node.js)
- **server.js** - Main server with Gemini API integration
  - Port: 3003
  - Endpoints: /chat, /chat-voice, /transcribe, /dashboard, /stats, /health
  - Features: voice transcription, chat, caching, cost tracking
  
- **package.json** - Dependencies (express, dotenv, etc.)

### Frontend
- **index.html** - Main UI with glassmorphism design
- **app.js** - Voice handling, Web Speech API, TTS
- **dashboard.html** - Cost tracking dashboard
- **Obiwon-portrait-wise.jpeg** - Avatar image

### Documentation
- **README.md** - Project documentation
- **SKILL.md** - OpenClaw skill documentation
- **TEMPLATE.md** - Reuse template for other classes

### Legacy/Backup
- **app-old.js**, **index-old.html** - Previous versions
- **server-rag.js**, **server-file-search.js** - Alternative implementations

## Available Tools

### File Operations
- **read** - Read file contents (text, images)
- **write** - Create or overwrite files
- **edit** - Make precise edits to files

### Execution
- **exec** - Run shell commands
- **process** - Manage background processes

### Web & Search
- **web_fetch** - Fetch content from URLs
- **web_search** - Search the web (via Exa skill)

### Development
- **browser** - Browser automation for testing
- **canvas** - UI testing and screenshots

## Available Skills

### document-creator
Create Excel spreadsheets and Word documents:
- Grade sheets, attendance trackers
- Course schedules
- Lesson plans, syllabi

### exa-search
Web search using Exa AI:
- Semantic content discovery
- Research and documentation
- $0.005 per search

### qmd
Local hybrid search for markdown notes:
- Search notes and docs
- Find related content
- Vector + BM25 search

## Capabilities

- Write code in any language (JavaScript, Python, etc.)
- Build frontend components (React, Vue, HTML/CSS)
- Create scripts and automation
- Debug existing code
- Generate documentation
- Search web for solutions
- Create structured documents
- Test voice agent functionality

## Constraints

- Do NOT access API keys or credentials
- Do NOT expose secrets in code
- Do NOT modify .env files
- Do NOT change credential handling
- Work within the workspace directory
- Clean up temporary files after use
- Test changes when possible

## Common Tasks

1. **Add feature to server.js**
   - Check existing endpoints
   - Follow error handling patterns
   - Test with curl or browser

2. **Update dashboard.html**
   - Maintain glassmorphism design
   - Add new metrics/cards
   - Update JavaScript for new data

3. **Fix frontend issues**
   - Check app.js for voice handling
   - Test in Brave browser (Chrome has issues)
   - Verify Web Speech API compatibility

4. **Debug voice processing**
   - Check server logs
   - Verify API key status
   - Test transcription endpoint
