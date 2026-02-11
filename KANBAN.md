# Project Kanban

## Active Projects

### 1. Voice Agent for Creative Tech
**Status:** ✅ Complete
**Last Updated:** 2026-02-11

**Details:** See `memory/projects/voice-agent-creative-tech.md`

---

### 2. Innovation 5.0 Voice Agent
**Status:** ✅ Complete
**Last Updated:** 2026-02-11

**URL:** https://innovation.artgenies.com
**Dashboard:** https://innovation.artgenies.com/dashboard

**Description:**
Second voice agent instance for Innovation 5.0 course (PGE 5A CFA) with Web3 marketing focus.

**Deliverables:**
- ✅ Server running on port 3004
- ✅ Cloudflare tunnel configured (innovation.artgenies.com)
- ✅ Comprehensive RAG with full syllabus (9,970 bytes)
- ✅ Session-by-session course content
- ✅ Assessment criteria and project requirements
- ✅ Web3 marketing concepts (NFTs, DAOs, Metaverse, Token-gating)
- ✅ Dashboard with real-time stats
- ✅ Cross-browser compatible (Chrome, Brave, Safari, Android)

**Course Content:**
- Innovation 5.0 Syllabus 2025-26
- Web3 Marketing (8 files: NFT, Metaverse, DAO, Flywheel, Loyalty)
- KPI vs ROI Guide
- Show and Tell Guide
- Team Page Instructions

---

## Backlog / TODO

*(No active backlog items)*

---

## Completed ✅

### Voice Agent Platform - February 11, 2026 Major Update
**Status:** ✅ Multi-Instance Deployment
**Completed:** 2026-02-11

**Deliverables:**

**Innovation 5.0 Voice Agent:**
- ✅ Deployed to innovation.artgenies.com (port 3004)
- ✅ Cloudflare tunnel with dedicated subdomain
- ✅ Comprehensive RAG extracted from syllabus DOCX (9,970 bytes)
- ✅ Full 15-session course breakdown with assignments
- ✅ Web3 marketing content (NFTs, Metaverse, DAOs, Flywheel, Phygital)
- ✅ Assessment criteria (30/10/60 breakdown)
- ✅ Dashboard with real-time monitoring

**Safari & iOS Compatibility:**
- ✅ MIME type detection for Safari (audio/mp4 vs webm)
- ✅ AudioContext resumption for Safari security model
- ✅ Voice visualizer fixes for Safari (FFT optimization, fillRect fallback)
- ✅ Speech synthesis voice loading workaround
- ✅ Safari-specific error messages

**Android & Mobile Improvements:**
- ✅ Voice selector dropdown in Settings
- ✅ Enhanced male voice detection (Daniel priority)
- ✅ Pitch adjustment fallback (0.85) for female voices
- ✅ Voice testing on selection change
- 👨/👩 emoji indicators for voice gender

**Transcription Enhancements:**
- ✅ Enhanced Gemini prompts with ESMOD/fashion domain terms
- ✅ Retry logic with exponential backoff
- ✅ 8MB audio limit (was 100KB)
- ✅ Audio quality analysis and validation
- ✅ MIME type detection (WebM, MP4, WAV, Ogg)
- ✅ File extension mapping for ffmpeg processing

**System Configuration:**
- ✅ Timeout increased: 300s → 600s (10 minutes)
- ✅ Subagent archive: 30min → 60min
- ✅ Token optimization skill created
- ✅ Auto-decision logic for dev-agent spawning

**GitHub Updates:**
- ✅ All changes committed to wonword/voice-agent-self-hosted-v1
- ✅ Token optimization skill documentation
- ✅ SKILL.md updated with Safari/Android support

---

### Voice Agent - February 10, 2026 Update
**Status:** ✅ Deployed & Enhanced
**Completed:** 2026-02-10

**Deliverables:**
- ✅ Voice Agent deployed to voice.artgenies.com with glassmorphism UI
- ✅ Fixed voice processing (updated Gemini API key, added dotenv)
- ✅ Changed TTS to use Daniel voice (British male)
- ✅ Implemented zero-delay recording with pre-initialized microphone
- ✅ Removed bottom navigation bar from UI
- ✅ Removed green online status dot from avatar
- ✅ Created and pushed GitHub repo (wonword/voice-agent-self-hosted-v1)
- ✅ Created dashboard with real-time stats and cost tracking
- ✅ Fixed cron jobs (Morning Brief, Email Check, Exa Monitor)
- ✅ Discovered Management de Projet classes on OMNES calendar
- ✅ Fixed Google Calendar integration
- ✅ Added Exa web search to morning brief
- ✅ Created developer agent with Pony Alpha
- ✅ Added error handling to /transcribe endpoint
- ✅ Committed all changes to GitHub

---

### Google Tasks API Integration
**Status:** ✅ Complete
**Completed:** 2026-02-09

**Description:**
Google Tasks API access for task management integration.

**Deliverables:**
- ✅ Google Cloud Console setup
- ✅ Google Tasks API enabled
- ✅ OAuth credentials created
- ✅ Authentication completed (token saved)
- ✅ Task management scripts created:
  - `google-tasks.py` — List, add, complete tasks
  - `google-tasks-auth.py` — Authentication flow
- ✅ 13 tasks synced from wonword's list

**Usage:**
```bash
python3 scripts/google-tasks.py              # List tasks
python3 scripts/google-tasks.py --lists      # Show task lists
python3 scripts/google-tasks.py --add "New task" --due 2026-02-10
python3 scripts/google-tasks.py --done "task name"
```

---

### Email Manager Agent
**Status:** ✅ Complete
**Completed:** 2026-02-09

**Deliverables:**
- ✅ Multi-account monitoring (obiwonkim + wonword)
- ✅ Smart cleanup scripts with safety checks
- ✅ Bulk operations with preview mode
- ✅ Daily monitoring cron jobs
- ✅ Configuration and documentation

### Email Manager Agent
**Status:** ✅ Complete
**Completed:** 2026-02-09

**Deliverables:**
- ✅ Multi-account monitoring (obiwonkim + wonword)
- ✅ Smart cleanup scripts with safety checks
- ✅ Bulk operations with preview mode
- ✅ Daily monitoring cron jobs
- ✅ Configuration and documentation

---

## Ideas / Future

- [ ] Voice synthesis improvement (Kokoro integration)
- [ ] Calendar integration (Google Calendar API)
- [ ] Advanced email auto-filtering rules
- [ ] Morning brief enhancement (news, weather, calendar)

---

*Last updated: 2026-02-11*
