# Voice Agent Template

A reusable glassmorphism voice chat interface for AI tutoring apps.

## Quick Start

1. **Copy the template files:**
   ```bash
   cp -r skills/voice-agent/ skills/your-new-voice-app/
   cd skills/your-new-voice-app
   ```

2. **Customize these files:**

### index.html
- **Line 6:** Change `<title>` to your app name
- **Line 189:** Replace avatar image (`Obiwon-portrait-wise.jpeg`)
- **Line 192:** Change fallback emoji from 🧙‍♂️ to your character
- **Line 195:** Update `Creative Tech` title
- **Line 196:** Update subtitle (`Obiwon AI tutor`)
- **Line 235:** Update welcome message text

### app.js  
- **Line 7:** Keep `API_BASE_URL = ''` for same-domain deployment
- **Line 158-165:** Adjust voice preference order (Daniel = British male)

### .env
```
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3003
```

### server.js
- **Line 11:** Change `RAG_KNOWLEDGE_PATH` to your course materials

## Customization Checklist

- [ ] Avatar image (recommend: 500x500px, circular crop)
- [ ] App title and subtitle  
- [ ] Welcome message
- [ ] Voice character name (Daniel, Fred, etc.)
- [ ] Accent/language preference
- [ ] Color scheme (search for `primary-` in CSS)
- [ ] API endpoints (/transcribe, /chat)

## Deployment

```bash
# Start server
export GEMINI_API_KEY="your-key"
node server.js

# Tunnel (for external access)
cloudflared tunnel run your-tunnel-name
```

## Features Included

✅ Dark glassmorphism UI  
✅ Voice recording with instant capture  
✅ Canvas-based audio visualizer  
✅ Text input fallback  
✅ Browser TTS with male voice preference  
✅ Responsive design  
✅ No external dependencies (Tailwind via CDN)  

## File Structure

```
your-voice-app/
├── index.html          # Main UI
├── app.js              # Frontend logic
├── server.js           # Node.js backend
├── .env                # API keys
├── .env.example        # Template
├── Obiwon-portrait-wise.jpeg  # Avatar
└── README.md           # Docs
```

## API Endpoints Required

Your server needs these endpoints:
- `POST /transcribe` - Audio → Text (Gemini)
- `POST /chat` - Text → AI Response (Gemini)
- `GET /health` - Health check

See `server.js` for implementation details.

## Tips

- **Avatar:** Use a square image, at least 200x200px
- **Voice:** Test different voices with `window.speechSynthesis.getVoices()` in browser console
- **Colors:** The primary color is `#0ea5e9` (sky blue) - change in Tailwind config
- **Cache:** Add `?v=2` to script src when updating to bust cache