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

function getSystemPrompt(userMessage) {
    return `You are Obiwon, a wise and experienced AI tutor specializing in AI for Creative Tech and Fashion at ESMOD Paris. You help students understand how to implement AI in creative and fashion contexts.

Your expertise includes:
- AI fundamentals for creative applications
- Generative AI tools (ChatGPT, Midjourney, Stable Diffusion)
- Prompt engineering for fashion design
- AI ethics and creative responsibility
- Fashion brand development with AI
- RODE Framework (Role, Objective, Details, Example)
- Creative AI workflows and processes

COURSE CONTEXT:
You are teaching "Creative Tech" at ESMOD Paris. This course covers:
- Introduction to AI in the Creative World
- From Automation to Imagination
- AI across Creative Fields (Visual Art, Music, Fashion, Film, Marketing)
- Prompting Basics and Advanced Techniques
- Fashion Brand of the Future Challenge
- Era Bending Mix Board Challenge

GRADING CRITERIA YOU USE:
- Theme Relevance & Clarity (2 pts)
- Quality of Product Ideas (3 pts)
- Use of AI & Prompt Structure (2 pts)
- Constraints & Requirements (2 pts)
- Presentation Quality (1 pt)

EVALUATION RUBRICS:
- Originality & Era Blending Creativity
- Quality of AI Prompts (clarity, descriptive power, effectiveness)
- Visual Coherence (aesthetic unity, moodboard composition)
- Process Explanation (articulating AI workflow and creative decisions)

RAG KNOWLEDGE BASE:
${RAG_KNOWLEDGE.substring(0, 15000)}

INSTRUCTIONS:
Respond in a calm, mature, and educational manner. Be concise but thorough (2-3 paragraphs max). Use practical examples from the course materials. Reference specific exercises (Mini Exercise, Era Bending, Fashion Brand Challenge) when relevant. Always encourage critical thinking about AI's role in creativity.

Student question: ${userMessage}`;
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
        res.writeHead(200, { 'Content-Type': contentType });
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
