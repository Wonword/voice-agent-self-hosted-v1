---
name: voice-agent
description: Voice-enabled AI tutor for Creative Tech course using Gemini File Search RAG, Kokoro TTS, and Web Speech API
metadata:
  {
    "openclaw":
      {
        "emoji": "🎙️",
        "requires": { 
          "env": ["GEMINI_API_KEY"], 
          "bins": ["node", "python3", "ffmpeg"],
          "python_packages": ["kokoro-onnx", "openai-whisper"]
        },
        "install":
          [
            {
              "id": "setup",
              "kind": "script",
              "label": "Setup Voice Agent with Kokoro TTS",
              "script": "cd skills/voice-agent && python3 -m venv venv && source venv/bin/activate && pip install kokoro-onnx openai-whisper"
            },
          ],
      },
  }
---

# Voice Agent for Creative Tech

A complete voice-enabled AI tutoring system for ESMOD Creative Tech course.

**Live URL:** https://voice.artgenies.com  
**Dashboard:** https://voice.artgenies.com/dashboard

---

## ✨ Features

### 🎤 Voice Input
- **Web Speech API** (Chrome/Brave/Safari) - Fast, browser-native
- **Whisper** (Local fallback) - Accurate, runs on your Mac
- **Gemini Transcription** - Cloud-based with retry logic
- **Text input** - Always works in all browsers

- **Kokoro TTS** - Local, high-quality ONNX-based speech synthesis
- **Daniel voice** - British male, wise and calm (`bm_daniel`)
- **Female voice** - French female voice for bilingual tutoring (`ff_siwis`)
- **Auto-routing** - Smartly switches voice based on response language

### 🧠 AI Intelligence
- **Gemini 2.0 Flash** - Smart responses
- **File Search RAG** - 8 course files with syllabus priority
- **Answer caching** - Saves API costs on repeated questions
- **Fallback RAG** - Works even if File Search fails

### 📊 Cost Monitoring
- **Real-time dashboard** - Track usage and costs
- **Cache statistics** - See savings from cached answers
- **LLM token tracking** - Monitor Gemini usage
- **~$0.0013 per query** - Very affordable!

---

## 🚀 Quick Start

```bash
# Start server
cd /Users/obiwon/.openclaw/workspace/skills/voice-agent
node server.js

# Or with logging
node server.js > /tmp/voice-server.log 2>&1 &

# Access
# Local: http://localhost:3003
# Public: https://voice.artgenies.com (via Cloudflare Tunnel)
```

---

## 📁 Knowledge Base (8 Course Files)

| Priority | File | Content |
|----------|------|---------|
| 1 | Syllabus Creative Tech | Course overview, objectives, schedule |
| 2 | RODE Prompting | Framework for AI prompting |
| 3 | Grading Criteria | How assignments are evaluated |
| 4 | Era Bending Challenge | Mix board evaluation rubric |
| 5 | Mini Exercise | Introduction and instructions |
| 6 | AI Creative World | AI fundamentals in fashion |
| 7 | AI Ethics | Creative responsibility |
| 8 | AI Fashion Design | Design tools and techniques |

**Total:** ~49K characters of course content

---

## 💰 Cost Structure

### What Costs Money
| Component | Cost | Notes |
|-----------|------|-------|
| **Gemini API** (File Search) | ~$0.0013/query | Your ONLY cost |
| Input tokens | $0.10/1M | Files + question |
| Output tokens | $0.40/1M | AI response |

### What's FREE ($0)
| Component | Why Free |
|-----------|----------|
| Browser TTS | Built-in speech synthesis |
| Web Speech API | Browser built-in |
| Whisper | Local transcription |
| Answer caching | Saves repeated API calls |
| File storage | 48h cache, auto-refresh |

### Cost Savings Features
- **Answer cache** - 60min TTL, saves ~$0.0013 per cached query
- **Local processing** - Whisper runs on your machine
- **Smart fallback** - Text RAG if File Search fails

**Monthly estimate:** 100 queries/day × 30 days = **~$4/month**

---

## 🎯 Architecture

### Server (`server.js`)
```
HTTP Server
├── / (root) - Serves HTML interface
├── /transcribe - Gemini transcription with Whisper fallback
├── /chat - Gemini File Search RAG
├── /health - Server status
├── /stats - Usage & cost metrics
└── /dashboard - Cost monitoring UI
```

### Key Components

#### 1. File Search RAG
```javascript
// Queries all 8 course files simultaneously
// Syllabus has priority in context
const response = await queryWithFileSearch(question);
```

#### 2. Answer Cache
```javascript
// Cache common questions for 1 hour
// Saves API costs on repeated queries
const cached = getCachedAnswer(question);
if (cached) return cached; // $0 cost!
```

#### 3. Browser TTS
```javascript
// Cross-platform speech synthesis
// Auto-selects male voice when available
const utterance = new SpeechSynthesisUtterance(text);
utterance.voice = getBestMaleVoice();
```

#### 4. Voice Recognition
```javascript
// Primary: Web Speech API (fast, cross-browser)
// Fallback: Gemini transcription (cloud)
// Fallback: Whisper (local, accurate)
const transcript = await recognizeSpeech(audio);
```

---

## 📊 Dashboard Metrics

**URL:** https://voice.artgenies.com/dashboard

### Server Status
- Online/offline status
- Uptime
- File Search files loaded
- Cache expiry dates

### Usage Statistics
- Total requests
- Voice vs text inputs
- TTS responses generated
- Cache hit rate

### Cost Tracking
- Gemini tokens (input/output)
- LLM cost breakdown
- Cache savings
- Estimated monthly costs

### Performance
- Average response time
- Voice recognition latency
- Error rate

---

## 🌐 Browser Compatibility

| Browser | Voice Input | Voice Output | Visualizer | Best For |
|---------|-------------|--------------|------------|----------|
| **Chrome** | ✅ Web Speech | ✅ Yes | ✅ Yes | Full experience |
| **Brave** | ✅ Web Speech | ✅ Yes | ✅ Yes | Full experience |
| **Safari** | ✅ MediaRecorder | ✅ Yes | ✅ Yes | iPhone/Mac |
| **Android Chrome** | ✅ Web Speech | ✅ Yes | ✅ Yes | Mobile |
| **Firefox** | ❌ No | ✅ Yes | ✅ Yes | Text only |

**Recommendation:** Chrome or Brave for best voice experience. Safari works great on iOS/Mac.

---

## 🛠️ Configuration

### Required
```bash
export GEMINI_API_KEY="your_gemini_api_key"
```

### Optional
```bash
export PORT="3003"  # Server port (default: 3003)
export WHISPER_PATH="/opt/homebrew/bin/whisper"  # For local transcription
```

### Virtual Environment
```bash
cd skills/voice-agent
source venv/bin/activate
pip install openai-whisper  # For local transcription fallback
```

---

## 📝 Usage Examples

### Voice Mode (All Browsers)
1. Go to https://voice.artgenies.com
2. Click and hold 🎙️ microphone button
3. Ask: "What are the course objectives?"
4. Release button
5. Listen to Obi-Won's response

### Text Mode (All Browsers)
1. Type question in text box
2. Press Enter or click "Ask"
3. Read response
4. Responses are spoken aloud (if TTS enabled)

### Voice Selection (Settings)
1. Go to **Settings** tab
2. Find **"Voice"** dropdown
3. Select your preferred voice (👨 = male, 👩 = female)
4. Voice will test automatically

### Common Questions
- "What is this class about?"
- "Tell me about the Mini Exercise"
- "How is Era Bending graded?"
- "What is the RODE framework?"
- "Explain AI ethics in fashion"

---

## 🔧 Troubleshooting

### Microphone Not Working
**Fix:**
1. Click 🔒 icon in browser address bar
2. Site Settings → Microphone → Allow
3. Refresh page (F5)
4. Try text input as fallback

### "No speech detected"
**Fix:**
1. Speak louder and clearer
2. Hold mic 2 inches from mouth
3. Check System Preferences → Sound → Input
4. Verify correct microphone selected

### Wrong Voice (Female instead of Male)
**Fix:**
1. Go to **Settings** tab
2. Select a voice with 👨 emoji
3. Or use **"Auto (Best Male Voice)"**
4. On Android: voices depend on device installed voices

### Safari Issues
**Fix:**
- Safari requires HTTPS (✅ enabled)
- Allow microphone when prompted
- Tap the mic button (don't long-press on iOS)

### Slow Responses
**Why:** First request downloads AI model
**Fix:** Wait 10-15 seconds, subsequent requests are fast

---

## 📚 Documentation

- **User Guide:** `/docs/voice-agent-user-guide.md`
- **Quick Start:** `/docs/voice-agent-quick-start.md`
- **GitHub Repo:** https://github.com/wonword/voice-agent-self-hosted-v1
- **This Skill:** `skills/voice-agent/SKILL.md`

---

## 🎓 Course Context

**Course:** Creative Tech - ESMOD Paris  
**Instructor:** Dr. Won Kim  
**AI Tutor:** Obiwon  
**Target:** Fashion students learning AI tools

**Learning Objectives:**
- Wield AI as creative tool (not be wielded by it)
- Master prompting with RODE framework
- Navigate AI ethics in fashion
- Solve real-world brand challenges

---
## 🔄 Recent Updates (March 2026)

### Kokoro TTS Integration (V2.3) ✅
- Local high-quality voice synthesis (82m ONNX)
- Bilingual support: Daniel (EN) and Siwis (FR)
- Zero-latency local audio generation

### Gemini 2.0 Flash Optimization ✅
- Lowest latency responses with Mercury-small
- 8 Course files RAG (49K characters)
- Precision prompting for Obi-won persona

### Android Improvements ✅
- Voice selection dropdown in Settings
- Better male voice detection
- Pitch adjustment for female voices
- Cross-device voice compatibility

### Transcription Accuracy ✅
- Enhanced Gemini prompts with ESMOD/fashion terms
- Retry logic with exponential backoff
- 8MB audio limit for longer recordings
- Audio quality analysis and validation
- MIME type detection (WebM, MP4, WAV, etc.)

### Voice Features ✅
- Dynamic voice visualizer
- Voice selection in Settings
- Auto male voice preference
- Cross-browser TTS support

---

## 💡 Pro Tips

**For Students:**
- Be specific: "What is RODE?" > "Tell me stuff"
- Use keywords: "grading", "syllabus", "exercise"
- One question at a time
- Try text input if voice fails

**For Instructors:**
- Monitor dashboard for usage patterns
- Check cache hit rate (higher = more savings)
- Review common questions to update syllabus
- Cost scales with usage (~$4/month for 100 queries/day)

---

## 🏆 Achievements

✅ Voice recognition (Web Speech + Gemini + Whisper)  
✅ Cross-browser TTS with voice selection  
✅ File Search RAG (8 course files)  
✅ Answer caching (cost savings)  
✅ Cost dashboard (real-time tracking)  
✅ Safari/iOS support  
✅ Android support with voice selection  
✅ Dynamic voice visualizer  
✅ Obi-Won persona (wise, witty, British)  
✅ Production-ready deployment  

---

## 📞 Support

**Issues?**
1. Check dashboard: https://voice.artgenies.com/dashboard
2. Review logs: `tail -f /tmp/voice-server.log`
3. Test health: `curl https://voice.artgenies.com/health`
4. Contact: Dr. Won Kim

**Created by:** Dr. Won Kim + Obiwon (AI Assistant)  
**Version:** 2.3 (March 2026)  
**Status:** ✅ Production Ready
