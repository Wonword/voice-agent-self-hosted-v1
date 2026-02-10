---
name: voice-agent
description: Voice-enabled AI tutor using Gemini for speech recognition and browser TTS. Specialized in Applied AI for Business and Marketing education.
emoji: 🎙️
author: Obiwon
version: 1.0.0
---

# Voice Agent - Obiwon AI Tutor

A voice-enabled AI tutoring system that combines Gemini AI for speech recognition and intelligent responses with browser-native text-to-speech.

## Features

- 🎤 **Voice Input**: Speech-to-text using Gemini 2.0 Flash
- 🤖 **AI Brain**: Gemini 2.0 Pro for intelligent tutoring responses
- 🔊 **Voice Output**: Browser-native TTS with male English voice
- 🧙‍♂️ **Character**: Obiwon - wise AI tutor for Business & Marketing
- 📚 **Knowledge**: Applied AI, Strategy, Marketing, Analytics, ROI

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │────▶│  Gemini API  │────▶│   Browser   │
│  (Voice In) │     │ (Transcribe) │     │  (TTS Out)  │
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  Gemini API  │
                     │   (Chat)     │
                     └──────────────┘
```

## Components

### Server (`server.js`)
- Express-style HTTP server
- Handles audio upload for transcription
- Routes chat requests to Gemini
- Serves static HTML/CSS/JS

### Client (`index.html`)
- Voice recording interface
- Audio visualization
- Chat display
- Browser TTS integration

## Setup

1. **Environment Variables**:
   ```bash
   export GEMINI_API_KEY="your_key_here"
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start Server**:
   ```bash
   node server.js
   ```

4. **Access**:
   - Local: http://localhost:3003
   - Public: Use ngrok for external access

## Usage

1. **Hold the microphone button** and speak
2. **Release** to send
3. **Listen** as Obiwon responds with voice
4. **Click "🔊 Speak"** button to replay any response

## Voice Selection

The system automatically selects the best available male English voice:
- Daniel (British)
- Google UK English Male
- Microsoft David/Mark/James
- Fred
- Alex

## Knowledge Areas

- Applied AI Fundamentals
- AI Strategy Development
- Customer Segmentation
- Digital Marketing AI
- Predictive Analytics
- AI Implementation
- ROI Measurement

## Technical Notes

- Uses native Web Speech API for TTS
- No external TTS service required
- Works offline after page load
- Supports all modern browsers