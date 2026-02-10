const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3003;
const UPLOAD_DIR = '/tmp/gemini-voice-uploads';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Create upload directory
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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
    
    // Serve the main HTML file
    if (req.method === 'GET' && req.url === '/') {
        serveFile(res, '/Users/obiwon/.openclaw/workspace/obiwon-gemini-voice.html', 'text/html');
        return;
    }
    
    // Serve avatar
    if (req.method === 'GET' && req.url === '/obiwan-avatar.jpg') {
        serveFile(res, '/Users/obiwon/.openclaw/workspace/obiwan-avatar.jpg', 'image/jpeg');
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
            const base64Audio = buffer.toString('base64');
            
            console.log(`[${new Date().toISOString()}] Transcribing audio with Gemini...`);
            
            // Call Gemini API for transcription
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
                            { text: 'Transcribe this audio to text. Only return the spoken words.' }
                        ]
                    }]
                })
            });
            
            const responseData = await response.json();
            const transcription = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
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

async function handleGeminiChat(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const userMessage = data.message;
            
            console.log(`[${new Date().toISOString()}] Gemini chat: "${userMessage.substring(0, 50)}..."`);
            
            const systemPrompt = `You are Obiwon, a wise and experienced AI tutor specializing in Applied AI for Business and Marketing. You help master-level business students understand how to implement AI strategies in real-world business contexts.

Your expertise includes:
- Applied AI fundamentals and business applications
- AI strategy development and implementation
- Customer segmentation with AI
- Digital marketing and AI
- Predictive analytics for business
- ROI measurement for AI initiatives
- Machine learning for business leaders

Respond in a calm, mature, and educational manner. Be concise but thorough (2-3 paragraphs max). Use practical examples from companies like Amazon, Netflix, Coca-Cola, and Starbucks. Always relate concepts back to business outcomes and ROI.

Student question: ${userMessage}`;

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
            
            const systemPrompt = `You are Obiwon, a wise and experienced AI tutor specializing in Applied AI for Business and Marketing.

Respond in a calm, mature, and educational manner. Be concise (1-2 paragraphs). Use practical examples.

Student question: ${userMessage}`;

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
            
            // Now generate audio using Gemini's TTS
            // Note: Gemini doesn't have native TTS, so we'll use ElevenLabs for voice
            // But we can use Gemini's Multimodal API for other purposes
            
            // For now, return text - voice will be handled separately
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
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

server.listen(PORT, () => {
    console.log(`🧙‍♂️ Obiwon Gemini Voice Tutor running on http://localhost:${PORT}`);
    console.log(`🤖 AI: Gemini 2.0 Flash`);
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