const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3003;
const UPLOAD_DIR = '/tmp/gemini-voice-uploads';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Usage tracking for cost monitoring
let usageStats = {
    totalRequests: 0,
    voiceInputs: 0,
    textInputs: 0,
    ttsResponses: 0,
    geminiTokensIn: 0,
    geminiTokensOut: 0,
    fileSearchQueries: 0,
    fallbackQueries: 0,
    whisperTranscriptions: 0,
    cacheHits: 0,
    errors: 0,
    startTime: Date.now()
};

// Simple answer cache to reduce API costs
const answerCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const CACHE_MAX_SIZE = 100;

function normalizeQuestion(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

function getCachedAnswer(question) {
    const normalized = normalizeQuestion(question);
    const cached = answerCache.get(normalized);
    
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        answerCache.delete(normalized);
        return null;
    }
    
    // Update hit count
    cached.hits = (cached.hits || 0) + 1;
    
    console.log(`[${new Date().toISOString()}] Cache HIT for: "${question.substring(0, 50)}..." (hits: ${cached.hits})`);
    return cached.answer;
}

function setCachedAnswer(question, answer) {
    // Evict oldest if at max size
    if (answerCache.size >= CACHE_MAX_SIZE) {
        const oldest = answerCache.entries().next().value;
        if (oldest) {
            answerCache.delete(oldest[0]);
        }
    }
    
    const normalized = normalizeQuestion(question);
    answerCache.set(normalized, {
        answer: answer,
        timestamp: Date.now(),
        hits: 0
    });
    
    console.log(`[${new Date().toISOString()}] Cached answer for: "${question.substring(0, 50)}..." (cache size: ${answerCache.size})`);
}

// Log usage to file
function logUsage(event, details = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, event, ...details };
    
    // Append to log file
    const logPath = '/tmp/voice-agent-usage.jsonl';
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    
    // Update stats
    usageStats.totalRequests++;
    if (event === 'voice_input') usageStats.voiceInputs++;
    if (event === 'text_input') usageStats.textInputs++;
    if (event === 'tts_response') usageStats.ttsResponses++;
    if (event === 'file_search') usageStats.fileSearchQueries++;
    if (event === 'fallback_rag') usageStats.fallbackQueries++;
    if (event === 'whisper_transcription') usageStats.whisperTranscriptions++;
    if (event === 'cache_hit') usageStats.cacheHits++;
    if (event === 'error') usageStats.errors++;
    
    console.log(`[${timestamp}] ${event}`, details);
}

// File Search RAG Configuration
// These are the 8 course files uploaded to Gemini (expire Feb 9, 2026)
// Format: https://generativelanguage.googleapis.com/v1beta/files/FILE_ID
// ORDER MATTERS: Syllabus first for priority context
const FILE_SEARCH_FILES = [
    'https://generativelanguage.googleapis.com/v1beta/files/i3s81yxwa2eo',  // 1. Syllabus Creative Tech ESMOD 2026 (PRIORITY)
    'https://generativelanguage.googleapis.com/v1beta/files/j7ahoso1upe6',  // 2. Generative AI & RODE Prompting
    'https://generativelanguage.googleapis.com/v1beta/files/bjudli1kdxkq',  // 3. Grading Criteria for Mini Exercise
    'https://generativelanguage.googleapis.com/v1beta/files/hl87igo9dp80',  // 4. Era Bending Mix Board Challenge Criteria
    'https://generativelanguage.googleapis.com/v1beta/files/gavfxrv4e723',  // 5. Mini Exercise Introduction
    'https://generativelanguage.googleapis.com/v1beta/files/9siqmrcjitp0',  // 6. AI Creative World Intro
    'https://generativelanguage.googleapis.com/v1beta/files/etwbrmglxmof',  // 7. AI Ethics & Creative Responsibility
    'https://generativelanguage.googleapis.com/v1beta/files/cbuc8wtju1hl'   // 8. AI Fashion Design
];

// Fallback RAG (if File Search fails or for older queries)
const RAG_KNOWLEDGE_PATH = '/Users/obiwon/Documents/ESMOD-Creative-Tech-RAG/RAG_KNOWLEDGE_BASE.md';
let RAG_KNOWLEDGE = '';
try {
    RAG_KNOWLEDGE = fs.readFileSync(RAG_KNOWLEDGE_PATH, 'utf8');
    console.log(`✅ Fallback RAG loaded: ${RAG_KNOWLEDGE.length} characters`);
} catch (err) {
    console.warn('⚠️ Could not load fallback RAG:', err.message);
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
        handleWhisperTranscription(req, res);
        return;
    }
    
    // Handle chat with Gemini using File Search RAG
    if (req.method === 'POST' && req.url === '/chat') {
        handleGeminiChatWithFileSearch(req, res);
        return;
    }
    
    // Handle voice chat with Gemini using File Search RAG
    if (req.method === 'POST' && req.url === '/chat-voice') {
        handleGeminiVoiceChatWithFileSearch(req, res);
        return;
    }
    
    // Handle Kokoro TTS
    if (req.method === 'POST' && req.url === '/speak') {
        handleKokoroTTS(req, res);
        return;
    }
    
    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            file_search: {
                enabled: true,
                files: FILE_SEARCH_FILES.length,
                files_expire: '2026-02-09'
            },
            fallback_rag: RAG_KNOWLEDGE.length > 0
        }));
        return;
    }
    
    // Re-upload files endpoint (for when files expire)
    if (req.method === 'POST' && req.url === '/refresh-files') {
        handleRefreshFiles(req, res);
        return;
    }
    
    // Serve dashboard
    if (req.method === 'GET' && req.url === '/dashboard') {
        serveFile(res, '/Users/obiwon/.openclaw/workspace/dashboard.html', 'text/html');
        return;
    }
    
    // Serve usage stats for dashboard
    if (req.method === 'GET' && req.url === '/stats') {
        const costEstimate = calculateCosts();
        
        // Calculate cache hit rate
        const totalQueries = usageStats.fileSearchQueries + usageStats.cacheHits;
        const cacheHitRate = totalQueries > 0 ? ((usageStats.cacheHits / totalQueries) * 100).toFixed(1) : 0;
        
        // Calculate estimated savings from cache
        const savedQueries = usageStats.cacheHits;
        const estimatedSavings = (savedQueries * 0.0013).toFixed(4); // $0.0013 per query
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ...usageStats,
            costEstimate,
            uptime: process.uptime(),
            cacheSize: answerCache.size,
            cacheHitRate: cacheHitRate + '%',
            estimatedSavings: '$' + estimatedSavings,
            cacheMaxSize: CACHE_MAX_SIZE,
            cacheTTL: CACHE_TTL / 1000 / 60 + ' minutes'
        }));
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

async function handleWhisperTranscription(req, res) {
    const chunks = [];
    
    req.on('data', chunk => chunks.push(chunk));
    
    req.on('end', async () => {
        try {
            let buffer = Buffer.concat(chunks);
            
            // Check if audio was received
            if (buffer.length < 500) {
                console.log(`[${new Date().toISOString()}] Audio too short: ${buffer.length} bytes`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ transcript: '', debug: `Audio too short: ${buffer.length} bytes. Hold mic longer.` }));
                return;
            }
            
            console.log(`[${new Date().toISOString()}] Received audio: ${buffer.length} bytes`);
            
            // Save audio to temp file
            const tempId = Date.now();
            const webmPath = `/tmp/voice-${tempId}.webm`;
            const wavPath = `/tmp/voice-${tempId}.wav`;
            
            fs.writeFileSync(webmPath, buffer);
            console.log(`[${new Date().toISOString()}] Saved audio to ${webmPath}`);
            
            // Convert webm to wav using ffmpeg (if available) or use webm directly
            // Whisper can handle webm directly in newer versions
            
            // Run Whisper transcription
            console.log(`[${new Date().toISOString()}] Running Whisper transcription...`);
            
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);
            
            let transcription = '';
            try {
                // Use whisper with base model for speed
                const { stdout, stderr } = await execPromise(
                    `whisper "${webmPath}" --model base --language en --output_format txt --output_dir /tmp --fp16 False 2>&1`,
                    { timeout: 30000 }
                );
                
                console.log(`[${new Date().toISOString()}] Whisper output: ${stdout}`);
                if (stderr) console.log(`[${new Date().toISOString()}] Whisper stderr: ${stderr}`);
                
                // Read the transcription file
                const txtPath = `/tmp/voice-${tempId}.txt`;
                if (fs.existsSync(txtPath)) {
                    transcription = fs.readFileSync(txtPath, 'utf8').trim();
                    console.log(`[${new Date().toISOString()}] Transcription from file: "${transcription}"`);
                } else {
                    // Try to extract from stdout
                    const lines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('[') && !l.includes('whisper'));
                    transcription = lines.join(' ').trim();
                    console.log(`[${new Date().toISOString()}] Transcription from stdout: "${transcription}"`);
                }
                
            } catch (whisperError) {
                console.error(`[${new Date().toISOString()}] Whisper error:`, whisperError.message);
                // Try Gemini as fallback
                console.log(`[${new Date().toISOString()}] Falling back to Gemini transcription...`);
                transcription = await transcribeWithGeminiFallback(buffer);
            }
            
            // Cleanup temp files
            try {
                fs.unlinkSync(webmPath);
                fs.unlinkSync(`/tmp/voice-${tempId}.txt`);
            } catch (e) {}
            
            // Clean up transcription
            transcription = transcription.trim();
            if (transcription === '[BLANK_AUDIO]' || transcription === '') {
                console.log(`[${new Date().toISOString()}] No speech detected`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ transcript: '', debug: 'No speech detected' }));
                return;
            }
            
            console.log(`[${new Date().toISOString()}] Final transcription: "${transcription.substring(0, 100)}..."`);
            
            // Log usage
            logUsage('whisper_transcription', { 
                textLength: transcription.length,
                audioBytes: buffer.length 
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ transcript: transcription }));
            
        } catch (error) {
            console.error('Transcription error:', error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                transcript: '', 
                error: 'Transcription failed', 
                details: error.message
            }));
        }
    });
}

async function transcribeWithGeminiFallback(buffer) {
    try {
        const base64Audio = buffer.toString('base64');
        
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
                        { text: 'Transcribe this audio to text. Return only the spoken words.' }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1024
                }
            })
        });
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
        console.error('Gemini fallback failed:', e.message);
        return '';
    }
}

function getBaseSystemPrompt() {
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

RULES:
1. Answer the question. Nothing more.
2. One concrete example beats five abstract concepts.
3. If they ask about grades/rubrics, be precise (points matter).
4. If they ask "how do I..." give them the prompt or the step. Skip the philosophy.
5. Wit is good. Rambling is bad.`;
}

async function queryWithFileSearch(userMessage) {
    // Build parts array with file references
    const parts = [
        { text: `${getBaseSystemPrompt()}\n\nStudent question: ${userMessage}\n\nAnswer based on the course materials provided. Focus on syllabus content first.` }
    ];
    
    // Add file references - Syllabus is first for priority
    for (const fileUri of FILE_SEARCH_FILES) {
        parts.push({
            fileData: {
                mimeType: 'application/pdf',
                fileUri: fileUri
            }
        });
    }
    
    console.log(`[${new Date().toISOString()}] Querying with File Search (${FILE_SEARCH_FILES.length} files, syllabus first)...`);
    
    try {
        // Add timeout to prevent long waits
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: parts }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 400
                }
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const responseData = await response.json();
        
        // Check for file expiration error
        if (responseData.error) {
            const errorMsg = responseData.error.message || '';
            if (errorMsg.includes('File') && errorMsg.includes('not found')) {
                console.warn('⚠️ File Search files expired, falling back to text RAG');
                return await queryWithFallbackRAG(userMessage);
            }
            throw new Error(responseData.error.message);
        }
        
        const aiResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text || 'I apologize, I could not generate a response.';
        
        // Track token usage if available
        const usage = responseData.usageMetadata;
        if (usage) {
            usageStats.geminiTokensIn += usage.promptTokenCount || 0;
            usageStats.geminiTokensOut += usage.candidatesTokenCount || 0;
        }
        
        // Log File Search success
        logUsage('file_search', { 
            responseLength: aiResponse.length,
            tokensIn: usage?.promptTokenCount || 0,
            tokensOut: usage?.candidatesTokenCount || 0
        });
        
        console.log(`[${new Date().toISOString()}] File Search response: "${aiResponse.substring(0, 50)}..."`);
        return aiResponse;
        
    } catch (error) {
        console.error('File Search error:', error.message);
        console.log('🔄 Falling back to text RAG...');
        return await queryWithFallbackRAG(userMessage);
    }
}

async function queryWithFallbackRAG(userMessage) {
    const systemPrompt = `${getBaseSystemPrompt()}

COURSE CONTEXT (from RAG Knowledge Base):
${RAG_KNOWLEDGE.substring(0, 4000)}

Student: ${userMessage}`;

    console.log(`[${new Date().toISOString()}] Using fallback text RAG...`);
    
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 500
            }
        })
    });
    
    const responseData = await response.json();
    
    if (responseData.error) {
        throw new Error(responseData.error.message);
    }
    
    const aiResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text || 'I apologize, I could not generate a response.';
    
    // Track fallback RAG usage
    logUsage('fallback_rag', { responseLength: aiResponse.length });
    
    return aiResponse;
}

async function handleGeminiChatWithFileSearch(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const userMessage = data.message;
            
            console.log(`[${new Date().toISOString()}] Chat: "${userMessage.substring(0, 50)}..."`);
            
            // Log usage
            logUsage('text_input', { messageLength: userMessage.length });
            
            // Check cache first
            const cachedAnswer = getCachedAnswer(userMessage);
            if (cachedAnswer) {
                console.log(`[${new Date().toISOString()}] Returning cached answer`);
                logUsage('cache_hit', { messageLength: userMessage.length });
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    response: cachedAnswer,
                    source: 'cache',
                    cached: true
                }));
                return;
            }
            
            // Not in cache, query File Search
            const aiResponse = await queryWithFileSearch(userMessage);
            
            // Cache the answer
            setCachedAnswer(userMessage, aiResponse);
            
            // Log response
            logUsage('chat_response', { 
                responseLength: aiResponse.length,
                inputType: 'text',
                cached: false
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                response: aiResponse,
                source: 'file_search',
                files_used: FILE_SEARCH_FILES.length,
                cached: false
            }));
            
        } catch (error) {
            console.error('Chat error:', error);
            logUsage('error', { type: 'chat_error', message: error.message });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Chat failed', details: error.message }));
        }
    });
}

async function handleGeminiVoiceChatWithFileSearch(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const userMessage = data.message;
            
            console.log(`[${new Date().toISOString()}] Voice chat: "${userMessage.substring(0, 50)}..."`);
            
            const aiResponse = await queryWithFileSearch(userMessage);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                response: aiResponse,
                source: 'file_search',
                files_used: FILE_SEARCH_FILES.length
            }));
            
        } catch (error) {
            console.error('Voice chat error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Voice chat failed', details: error.message }));
        }
    });
}

async function handleRefreshFiles(req, res) {
    // This endpoint would trigger re-upload of files
    // For now, just log that files need manual refresh
    console.log(`[${new Date().toISOString()}] File refresh requested`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
        message: 'Files need manual re-upload',
        current_files_expire: '2026-02-09',
        action: 'Run the file upload script to refresh files'
    }));
}

// Use Kokoro TTS for high-quality voice
async function handleKokoroTTS(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const text = data.text;
            
            if (!text) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No text provided' }));
                return;
            }
            
            console.log(`[${new Date().toISOString()}] Kokoro TTS: "${text.substring(0, 50)}..."`);
            
            // Log TTS usage
            logUsage('tts_response', { textLength: text.length });
            
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);
            
            const tempId = Date.now();
            const outputPath = `/tmp/kokoro-${tempId}.wav`;
            const venvPython = '/Users/obiwon/.openclaw/workspace/skills/voice-agent/venv/bin/python';
            const scriptPath = '/Users/obiwon/.openclaw/workspace/skills/voice-agent/kokoro_tts.py';
            
            try {
                // Generate audio with Kokoro
                await execPromise(
                    `"${venvPython}" "${scriptPath}" "${text.replace(/"/g, '\\"')}" "${outputPath}" 2>&1`,
                    { timeout: 60000 }
                );
                
                if (fs.existsSync(outputPath)) {
                    const audioBuffer = fs.readFileSync(outputPath);
                    
                    res.writeHead(200, { 
                        'Content-Type': 'audio/wav',
                        'Content-Length': audioBuffer.length
                    });
                    res.end(audioBuffer);
                    
                    // Cleanup
                    fs.unlinkSync(outputPath);
                    
                    console.log(`[${new Date().toISOString()}] Kokoro generated: ${audioBuffer.length} bytes`);
                } else {
                    throw new Error('Kokoro output file not created');
                }
                
            } catch (kokoroError) {
                console.error('Kokoro error:', kokoroError.message);
                // Fallback to browser TTS
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    useBrowserTTS: true, 
                    text: text,
                    voice: 'Google UK English Male'
                }));
            }
            
        } catch (error) {
            console.error('TTS handler error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'TTS failed', details: error.message }));
        }
    });
}

// Cost calculation
function calculateCosts() {
    // Gemini pricing: ~$0.0001 per 1K tokens (varies by model)
    const geminiCost = (usageStats.geminiTokensIn + usageStats.geminiTokensOut) * 0.0000001;
    
    // Kokoro TTS: Local, $0
    const kokoroCost = 0;
    
    // Web Speech API: Free (browser built-in)
    const webSpeechCost = 0;
    
    // Whisper: Local, $0
    const whisperCost = 0;
    
    return {
        gemini: geminiCost.toFixed(4),
        kokoro: kokoroCost.toFixed(2),
        webSpeech: webSpeechCost.toFixed(2),
        whisper: whisperCost.toFixed(2),
        total: (geminiCost + kokoroCost + webSpeechCost + whisperCost).toFixed(4)
    };
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
    console.log(`🧙‍♂️ Obiwon Gemini Voice Tutor (File Search Edition) running on http://localhost:${PORT}`);
    console.log(`🤖 AI: Gemini 2.0 Flash + File Search RAG`);
    console.log(`📚 File Search: ${FILE_SEARCH_FILES.length} course files`);
    console.log(`⚠️  Files expire: 2026-02-09`);
    console.log(`🔄 Fallback RAG: ${RAG_KNOWLEDGE ? '✅ Available' : '❌ Not loaded'}`);
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
