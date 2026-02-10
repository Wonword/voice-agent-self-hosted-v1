const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3003;
const UPLOAD_DIR = '/tmp/gemini-voice-uploads';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RAG_KNOWLEDGE_PATH = '/Users/obiwon/Documents/ESMOD-Creative-Tech-RAG/RAG_KNOWLEDGE_BASE.md';

// Load RAG Knowledge Base
let RAG_KNOWLEDGE = '';
try {
    RAG_KNOWLEDGE = fs.readFileSync(RAG_KNOWLEDGE_PATH, 'utf8');
    console.log(`✅ Loaded RAG Knowledge Base: ${RAG_KNOWLEDGE.length} characters`);
} catch (err) {
    console.warn('⚠️ Could not load RAG Knowledge Base:', err.message);
}

// Create upload directory
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const VOICE_SITE_DIR = '/Users/obiwon/.openclaw/workspace/skills/voice-agent';

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Handle audio upload for transcription
    if (req.method === 'POST' && req.url === '/transcribe') {
        handleGeminiTranscription(req, res);
        return;
    }
    
    // Handle chat with Gemini (text only)
    if (req.method === 'POST' && req.url === '/chat') {
        handleGeminiChat(req, res);
        return;
    }
    
    // Handle voice chat with Gemini (audio response)
    if (req.method === 'POST' && req.url === '/chat-voice') {
        handleGeminiVoiceChat(req, res);
        return;
    }
    
    // Serve the main HTML file from voice-site-redesign
    if (req.method === 'GET' && req.url === '/') {
        serveFile(res, path.join(VOICE_SITE_DIR, 'index.html'), 'text/html');
        return;
    }
    
    // Serve app.js
    if (req.method === 'GET' && req.url === '/app.js') {
        serveFile(res, path.join(VOICE_SITE_DIR, 'app.js'), 'application/javascript');
        return;
    }
    
    // Serve avatar image
    if (req.method === 'GET' && req.url === '/Obiwon-portrait-wise.jpeg') {
        serveFile(res, path.join(VOICE_SITE_DIR, 'Obiwon-portrait-wise.jpeg'), 'image/jpeg');
        return;
    }
    
    // Serve old avatar path for backwards compatibility
    if (req.method === 'GET' && req.url === '/obiwan-avatar.jpg') {
        serveFile(res, path.join(VOICE_SITE_DIR, 'Obiwon-portrait-wise.jpeg'), 'image/jpeg');
        return;
    }
    
    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            rag_loaded: RAG_KNOWLEDGE.length > 0
        }));
        return;
    }
    
    // 404
    res.writeHead(404);
    res.end('Not found');
});

async function handleGeminiTranscription(req, res) {
    const chunks = [];
    
    req.on('data', chunk => chunks.push(chunk));
    
    req.on('end', async () => {
        try {
            const buffer = Buffer.concat(chunks);
            
            // Check if audio was received
            if (buffer.length < 1000) {
                console.log(`[${new Date().toISOString()}] Audio too short: ${buffer.length} bytes`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ transcript: '' }));
                return;
            }
            
            // Check if audio is too large (Gemini has limits)
            if (buffer.length > 100000) { // ~100KB limit
                console.log(`[${new Date().toISOString()}] Audio too large: ${buffer.length} bytes, truncating...`);
                // Truncate to first 100KB (about 20-30 seconds of audio)
                buffer = buffer.slice(0, 100000);
            }
            
            const base64Audio = buffer.toString('base64');
            
            console.log(`[${new Date().toISOString()}] Transcribing audio (${buffer.length} bytes)...`);
            
            // Call Gemini API for transcription with improved prompt
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                inlineData: {
                                    mimeType: 'audio/webm',
                                    data: base64Audio
                                }
                            },
                            { text: 'Transcribe this English audio to text. Listen carefully and transcribe exactly what is spoken. If the audio is unclear or no speech is detected, respond with "[no speech detected]". Only return the spoken words, nothing else.' }
                        ]
                    }]
                })
            });
            
            const responseData = await response.json();
            
            // Check for errors
            if (responseData.error) {
                console.error('Gemini API error:', responseData.error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Transcription API error', details: responseData.error.message }));
                return;
            }
            
            let transcription = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            // Clean up transcription
            transcription = transcription.trim();
            if (transcription === '[no speech detected]' || transcription === '[No speech detected]') {
                transcription = '';
            }
            
            console.log(`[${new Date().toISOString()}] Transcribed: "${transcription.substring(0, 100)}..."`);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ transcript: transcription }));
            
        } catch (error) {
            console.error('Gemini transcription error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Transcription failed', details: error.message }));
        }
    });
}

function getSystemPrompt(userMessage) {
    return `You are Obiwon — think Jedi Master meets creative director. Wise, sharp, and allergic to fluff. You teach AI for Creative Tech at ESMOD Paris.

STYLE:
- Keep it short: 2-3 sentences max. Get in, drop knowledge, get out.
- Wit is welcome: dry humor, clever observations, occasional "I've seen this before" energy.
- No essays. If it takes more than 30 seconds to say, it's too long.
- Be direct. Cut the throat-clearing.

WHAT YOU KNOW:
- ESMOD Creative Tech course: AI tools, prompting, RODE framework, ethics, brand challenges
- The grading rubrics (10 points: theme, ideas, AI use, constraints, presentation)
- Era Bending Mix Board, Fashion Brand Challenge, Mini Exercise

COURSE CONTEXT (Key Info):
${RAG_KNOWLEDGE.substring(0, 3000)}

RULES:
1. Answer the question. Nothing more.
2. One concrete example beats five abstract concepts.
3. If they ask about grades/rubrics, be precise (points matter).
4. If they ask "how do I..." give them the prompt or the step. Skip the philosophy.
5. Wit is good. Rambling is bad.

Student: ${userMessage}`;
}

async function handleGeminiChat(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const userMessage = data.message;
            
            console.log(`[${new Date().toISOString()}] Gemini chat: "${userMessage.substring(0, 50)}..."`);
            
            const systemPrompt = getSystemPrompt(userMessage);

            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: systemPrompt }] }]
                })
            });
            
            const responseData = await response.json();
            const aiResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text || 'I apologize, I could not generate a response.';
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: aiResponse }));
            
        } catch (error) {
            console.error('Gemini chat error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Chat failed', details: error.message }));
        }
    });
}

async function handleGeminiVoiceChat(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const userMessage = data.message;
            
            console.log(`[${new Date().toISOString()}] Gemini voice chat: "${userMessage.substring(0, 50)}..."`);
            
            const systemPrompt = getSystemPrompt(userMessage);

            // Get text response from Gemini
            const textResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: systemPrompt }] }]
                })
            });
            
            const textData = await textResponse.json();
            const aiResponse = textData.candidates?.[0]?.content?.parts?.[0]?.text || 'I apologize, I could not generate a response.';
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: aiResponse }));
            
        } catch (error) {
            console.error('Gemini voice chat error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Voice chat failed', details: error.message }));
        }
    });
}

function serveFile(res, filePath, contentType) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.end(data);
    });
}

server.listen(PORT, () => {
    console.log(`🧙‍♂️ Obiwon Gemini Voice Tutor running on http://localhost:${PORT}`);
    console.log(`🤖 AI: Gemini 2.0 Flash + RAG Knowledge Base`);
    console.log(`📚 RAG: ${RAG_KNOWLEDGE ? '✅ Loaded' : '❌ Not loaded'}`);
    console.log(`🎙️ Voice: Using Gemini + Browser TTS`);
    console.log(`🌐 For remote access: ngrok http ${PORT}`);
});

// Cleanup old files periodically
setInterval(() => {
    fs.readdir(UPLOAD_DIR, (err, files) => {
        if (err) return;
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(UPLOAD_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtime.getTime() > 3600000) {
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
}, 600000);
