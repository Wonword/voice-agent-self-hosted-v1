require('dotenv').config();
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

// Stats tracking
const stats = {
    totalRequests: 0,
    voiceInputs: 0,
    textInputs: 0,
    aiResponses: 0,
    chatCalls: 0,
    transcriptionCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheHits: 0,
    cachedAnswers: 0,
    errors: 0,
    startTime: Date.now()
};

// Simple in-memory cache
const answerCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
    
    // Dashboard
    if (req.method === 'GET' && req.url === '/dashboard') {
        serveFile(res, path.join(VOICE_SITE_DIR, 'dashboard.html'), 'text/html');
        return;
    }
    
    // Stats endpoint for dashboard
    if (req.method === 'GET' && req.url === '/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            totalRequests: stats.totalRequests,
            voiceInputs: stats.voiceInputs,
            textInputs: stats.textInputs,
            aiResponses: stats.aiResponses,
            chatCalls: stats.chatCalls,
            transcriptionCalls: stats.transcriptionCalls,
            inputTokens: stats.inputTokens,
            outputTokens: stats.outputTokens,
            cacheHits: stats.cacheHits,
            cachedAnswers: stats.cachedAnswers,
            cacheHitRate: stats.totalRequests > 0 ? ((stats.cacheHits / stats.totalRequests) * 100).toFixed(1) : 0,
            cacheSavings: (stats.cacheHits * 0.0013).toFixed(4),
            costs: {
                gemini: ((stats.inputTokens * 0.0000001) + (stats.outputTokens * 0.0000004)),
                transcription: stats.transcriptionCalls * 0.0001,
                total: ((stats.inputTokens * 0.0000001) + (stats.outputTokens * 0.0000004)) + (stats.transcriptionCalls * 0.0001)
            },
            avgResponseTime: '~2s',
            transcriptionTime: '~1s',
            errorRate: stats.totalRequests > 0 ? ((stats.errors / stats.totalRequests) * 100).toFixed(1) : 0,
            rag: {
                loaded: RAG_KNOWLEDGE.length > 0,
                size: (RAG_KNOWLEDGE.length / 1024).toFixed(0) + 'KB',
                chars: RAG_KNOWLEDGE.length
            }
        }));
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

// ============================================
// TRANSCRIPTION CONFIGURATION & CONSTANTS
// ============================================
const TRANSCRIPTION_TIMEOUT = 30000; // 30 seconds
const MIN_AUDIO_SIZE = 1000; // 1KB minimum
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB maximum
const GEMINI_AUDIO_LIMIT = 8000000; // ~8MB for Gemini API (increased from 100KB)

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second base delay
const RETRY_DELAY_MAX = 8000; // 8 seconds max delay

// ============================================
// ERROR RESPONSE HELPER
// ============================================
function sendErrorResponse(res, statusCode, errorType, message, details = null) {
    stats.errors++;
    const errorResponse = { 
        error: errorType, 
        message: message,
        timestamp: new Date().toISOString(),
        retryable: errorType === 'RATE_LIMIT' || errorType === 'TIMEOUT' || errorType === 'NETWORK_ERROR' || errorType === 'SERVICE_UNAVAILABLE'
    };
    if (details) errorResponse.details = details;
    
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
}

// ============================================
// SLEEP HELPER FOR RETRY DELAYS
// ============================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// AUDIO PREPROCESSING - Analyze audio quality
// ============================================
function analyzeAudioQuality(buffer) {
    // Check if buffer has valid audio header
    const hasWebmHeader = buffer.length > 4 && 
        (buffer.toString('hex', 0, 4) === '1a45dfa3' || // EBML header (WebM)
         buffer.toString('ascii', 0, 4) === 'RIFF' ||   // WAV header
         buffer.toString('hex', 0, 2) === 'ffe3' ||     // MP3 header
         buffer.toString('hex', 0, 2) === 'fff3');      // MP3 header variant
    
    // Calculate audio entropy (simple measure of "quality")
    let entropy = 0;
    const sampleSize = Math.min(buffer.length, 1024);
    let zeroCount = 0;
    
    for (let i = 0; i < sampleSize; i++) {
        if (buffer[i] === 0) zeroCount++;
    }
    
    const zeroRatio = zeroCount / sampleSize;
    const quality = {
        hasValidHeader: hasWebmHeader,
        zeroRatio: zeroRatio,
        isMostlySilence: zeroRatio > 0.9,
        size: buffer.length,
        recommended: true
    };
    
    if (zeroRatio > 0.95) {
        quality.recommended = false;
        quality.issue = 'Audio appears to be mostly silence';
    }
    
    return quality;
}

// ============================================
// DETECT MIME TYPE FROM BUFFER
// ============================================
function detectMimeType(buffer) {
    if (buffer.length < 4) return 'audio/webm'; // default
    
    const hexHeader = buffer.toString('hex', 0, 4);
    const asciiHeader = buffer.toString('ascii', 0, 4);
    
    // WebM (EBML header)
    if (hexHeader === '1a45dfa3') return 'audio/webm';
    
    // WAV (RIFF header)
    if (asciiHeader === 'RIFF') return 'audio/wav';
    
    // MP3
    if (hexHeader.startsWith('ffe3') || hexHeader.startsWith('fff3') || 
        hexHeader.startsWith('fffb') || hexHeader.startsWith('fffa')) {
        return 'audio/mpeg';
    }
    
    // Ogg
    if (asciiHeader === 'OggS') return 'audio/ogg';
    
    // MP4/M4A
    const ftypCheck = buffer.toString('ascii', 4, 8);
    if (ftypCheck === 'ftyp') return 'audio/mp4';
    
    return 'audio/webm'; // default fallback
}

// ============================================
// MAIN TRANSCRIPTION HANDLER WITH RETRY LOGIC
// ============================================
async function handleGeminiTranscription(req, res) {
    const chunks = [];
    let requestAborted = false;
    
    // Handle client disconnect
    req.on('close', () => {
        requestAborted = true;
    });
    
    req.on('data', chunk => {
        if (!requestAborted) chunks.push(chunk);
    });
    
    req.on('end', async () => {
        if (requestAborted) {
            console.log(`[${new Date().toISOString()}] Transcription request aborted by client`);
            return;
        }
        
        try {
            stats.totalRequests++;
            stats.voiceInputs++;
            
            const buffer = Buffer.concat(chunks);
            
            // Validate audio buffer exists
            if (!buffer || buffer.length === 0) {
                console.log(`[${new Date().toISOString()}] No audio data received`);
                sendErrorResponse(res, 400, 'INVALID_AUDIO', 'No audio data received');
                return;
            }
            
            // Check minimum audio size
            if (buffer.length < MIN_AUDIO_SIZE) {
                console.log(`[${new Date().toISOString()}] Audio too short: ${buffer.length} bytes`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    transcript: '', 
                    message: 'Audio too short - please speak longer',
                    audioQuality: { tooShort: true }
                }));
                return;
            }
            
            // Check maximum audio size
            if (buffer.length > MAX_AUDIO_SIZE) {
                console.log(`[${new Date().toISOString()}] Audio too large: ${buffer.length} bytes`);
                sendErrorResponse(res, 413, 'AUDIO_TOO_LARGE', `Audio file exceeds maximum size of ${MAX_AUDIO_SIZE / 1024 / 1024}MB`);
                return;
            }
            
            // Analyze audio quality
            const quality = analyzeAudioQuality(buffer);
            if (!quality.recommended) {
                console.warn(`[${new Date().toISOString()}] Audio quality warning:`, quality.issue);
            }
            
            // Detect MIME type from buffer
            const detectedMimeType = detectMimeType(buffer);
            
            // Check if audio is too large for Gemini API (truncate if needed)
            let audioBuffer = buffer;
            if (buffer.length > GEMINI_AUDIO_LIMIT) {
                console.log(`[${new Date().toISOString()}] Audio truncated: ${buffer.length} -> ${GEMINI_AUDIO_LIMIT} bytes`);
                audioBuffer = buffer.slice(0, GEMINI_AUDIO_LIMIT);
            }
            
            // Validate API key is configured
            if (!GEMINI_API_KEY) {
                console.error(`[${new Date().toISOString()}] GEMINI_API_KEY not configured`);
                sendErrorResponse(res, 500, 'CONFIG_ERROR', 'Transcription service not properly configured');
                return;
            }
            
            const base64Audio = audioBuffer.toString('base64');
            
            // Validate base64 conversion
            if (!base64Audio || base64Audio.length === 0) {
                console.error(`[${new Date().toISOString()}] Failed to encode audio to base64`);
                sendErrorResponse(res, 500, 'ENCODING_ERROR', 'Failed to process audio data');
                return;
            }
            
            console.log(`[${new Date().toISOString()}] Transcribing audio (${audioBuffer.length} bytes, ${detectedMimeType})...`);
            
            stats.transcriptionCalls++;
            
            // ============================================
            // RETRY LOOP WITH EXPONENTIAL BACKOFF
            // ============================================
            let lastError = null;
            let transcriptionResult = null;
            
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    transcriptionResult = await attemptTranscription(base64Audio, detectedMimeType);
                    
                    // Success! Break out of retry loop
                    if (transcriptionResult.success) {
                        break;
                    }
                } catch (error) {
                    lastError = error;
                    
                    // Don't retry on certain errors
                    if (error.type === 'INVALID_REQUEST' || error.type === 'INVALID_API_KEY' || 
                        error.type === 'FORBIDDEN' || error.type === 'CONTENT_BLOCKED') {
                        console.log(`[${new Date().toISOString()}] Non-retryable error on attempt ${attempt}:`, error.type);
                        break;
                    }
                    
                    // Check if we should retry
                    if (attempt < MAX_RETRIES) {
                        const delay = Math.min(RETRY_DELAY_BASE * Math.pow(2, attempt - 1), RETRY_DELAY_MAX);
                        console.log(`[${new Date().toISOString()}] Retrying transcription (attempt ${attempt + 1}/${MAX_RETRIES}) after ${delay}ms...`);
                        await sleep(delay);
                    }
                }
            }
            
            // ============================================
            // HANDLE FINAL RESULT
            // ============================================
            if (transcriptionResult && transcriptionResult.success) {
                let transcription = transcriptionResult.text.trim();
                
                // Clean up transcription
                if (transcription === '[no speech detected]' || 
                    transcription === '[No speech detected]' ||
                    transcription === '[silence]' ||
                    transcription.toLowerCase().includes('no speech')) {
                    transcription = '';
                }
                
                console.log(`[${new Date().toISOString()}] Transcribed: "${transcription.substring(0, 100)}${transcription.length > 100 ? '...' : ''}"`);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    transcript: transcription,
                    success: true,
                    audioQuality: quality,
                    attempts: transcriptionResult.attempts || 1
                }));
                return;
            }
            
            // If we got here, all retries failed
            if (lastError) {
                console.error(`[${new Date().toISOString()}] All transcription attempts failed:`, lastError);
                sendErrorResponse(res, lastError.statusCode || 500, lastError.type || 'TRANSCRIPTION_FAILED', 
                    lastError.message || 'Transcription failed after multiple attempts', 
                    { attempts: MAX_RETRIES });
                return;
            }
            
            // Unexpected case
            sendErrorResponse(res, 500, 'UNKNOWN_ERROR', 'An unexpected error occurred during transcription');
            
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Unexpected transcription error:`, error);
            sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred during transcription', { 
                message: error.message,
                type: error.name
            });
        }
    });
}

// ============================================
// SINGLE TRANSCRIPTION ATTEMPT
// ============================================
async function attemptTranscription(base64Audio, mimeType) {
    // Set up timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TRANSCRIPTION_TIMEOUT);
    
    try {
        // Enhanced transcription prompt for better accuracy
        const transcriptionPrompt = `Transcribe this audio to text with the following requirements:
- Listen carefully and transcribe exactly what is spoken
- The speaker is likely discussing AI, Creative Technology, or the ESMOD course
- Ignore background noise, focus on clear speech
- If audio is unclear, noisy, or contains no intelligible speech, respond with "[no speech detected]"
- Only return the spoken words, no explanations or formatting
- If multiple people are speaking, transcribe the clearest voice`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Audio
                            }
                        },
                        { text: transcriptionPrompt }
                    ]
                }]
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Handle HTTP errors
        if (!response.ok) {
            let errorType = 'API_ERROR';
            let statusCode = response.status;
            let message = `HTTP ${response.status}: ${response.statusText}`;
            
            // Parse specific error codes
            switch (response.status) {
                case 400:
                    errorType = 'INVALID_REQUEST';
                    message = 'Invalid request to transcription service';
                    break;
                case 401:
                    errorType = 'INVALID_API_KEY';
                    message = 'Invalid API key. Please check your configuration.';
                    break;
                case 403:
                    errorType = 'FORBIDDEN';
                    message = 'API access denied. Please verify your API key permissions.';
                    break;
                case 429:
                    errorType = 'RATE_LIMIT';
                    message = 'Rate limit exceeded. Please wait a moment and try again.';
                    break;
                case 500:
                case 502:
                case 503:
                    errorType = 'SERVICE_UNAVAILABLE';
                    message = 'Transcription service temporarily unavailable. Please try again later.';
                    break;
            }
            
            throw { type: errorType, statusCode, message, retryable: errorType !== 'INVALID_REQUEST' && errorType !== 'INVALID_API_KEY' && errorType !== 'FORBIDDEN' };
        }
        
        let responseData;
        try {
            responseData = await response.json();
        } catch (parseError) {
            throw { type: 'PARSE_ERROR', statusCode: 500, message: 'Failed to parse transcription service response', retryable: false };
        }
        
        // Check for API-level errors in response body
        if (responseData.error) {
            const apiError = responseData.error;
            let errorType = 'API_ERROR';
            let statusCode = 500;
            let message = apiError.message || 'Transcription service error';
            
            // Handle specific error codes
            if (apiError.code) {
                switch (apiError.code) {
                    case 400:
                        errorType = 'INVALID_REQUEST';
                        statusCode = 400;
                        message = 'Invalid audio format or request parameters';
                        break;
                    case 401:
                        errorType = 'INVALID_API_KEY';
                        statusCode = 401;
                        message = 'Invalid or expired API key';
                        break;
                    case 403:
                        errorType = 'FORBIDDEN';
                        statusCode = 403;
                        message = 'API key does not have permission for this operation';
                        break;
                    case 429:
                        errorType = 'RATE_LIMIT';
                        statusCode = 429;
                        message = 'Rate limit exceeded. Please wait before trying again.';
                        break;
                    case 500:
                    case 502:
                    case 503:
                        errorType = 'SERVICE_UNAVAILABLE';
                        statusCode = 503;
                        message = 'Transcription service temporarily unavailable';
                        break;
                }
            }
            
            throw { type: errorType, statusCode, message, retryable: errorType === 'RATE_LIMIT' || errorType === 'SERVICE_UNAVAILABLE' };
        }
        
        // Validate response structure
        if (!responseData.candidates || !Array.isArray(responseData.candidates) || responseData.candidates.length === 0) {
            throw { type: 'INVALID_RESPONSE', statusCode: 500, message: 'Transcription service returned an invalid response', retryable: true };
        }
        
        // Check for blocked content
        const candidate = responseData.candidates[0];
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            if (candidate.finishReason === 'SAFETY') {
                throw { type: 'CONTENT_BLOCKED', statusCode: 400, message: 'Audio content could not be processed due to safety filters', retryable: false };
            }
        }
        
        const transcription = candidate.content?.parts?.[0]?.text || '';
        
        return { 
            success: true, 
            text: transcription,
            attempts: 1
        };
        
    } catch (fetchError) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
            throw { type: 'TIMEOUT', statusCode: 504, message: 'Transcription request timed out. Please try again.', retryable: true };
        }
        
        // If already formatted error, pass through
        if (fetchError.type) {
            throw fetchError;
        }
        
        // Network error
        throw { type: 'NETWORK_ERROR', statusCode: 503, message: 'Unable to connect to transcription service. Please check your network connection.', retryable: true };
    }
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
            stats.totalRequests++;
            stats.textInputs++;
            
            const data = JSON.parse(body);
            const userMessage = data.message;
            
            console.log(`[${new Date().toISOString()}] Gemini chat: "${userMessage.substring(0, 50)}..."`);
            
            // Check cache first
            const cacheKey = userMessage.toLowerCase().trim();
            if (answerCache.has(cacheKey)) {
                const cached = answerCache.get(cacheKey);
                if (Date.now() - cached.timestamp < CACHE_TTL) {
                    console.log(`[${new Date().toISOString()}] Cache hit for: "${userMessage.substring(0, 50)}..."`);
                    stats.cacheHits++;
                    stats.aiResponses++;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ response: cached.answer }));
                    return;
                }
            }
            
            const systemPrompt = getSystemPrompt(userMessage);
            stats.chatCalls++;
            stats.inputTokens += systemPrompt.length / 4; // Rough estimate

            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: systemPrompt }] }]
                })
            });
            
            const responseData = await response.json();
            const aiResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text || 'I apologize, I could not generate a response.';
            
            stats.aiResponses++;
            stats.outputTokens += aiResponse.length / 4; // Rough estimate
            
            // Cache the answer
            answerCache.set(cacheKey, { answer: aiResponse, timestamp: Date.now() });
            stats.cachedAnswers = answerCache.size;
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: aiResponse }));
            
        } catch (error) {
            console.error('Gemini chat error:', error);
            stats.errors++;
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
            stats.totalRequests++;
            stats.voiceInputs++;
            
            const data = JSON.parse(body);
            const userMessage = data.message;
            
            console.log(`[${new Date().toISOString()}] Gemini voice chat: "${userMessage.substring(0, 50)}..."`);
            
            // Check cache first
            const cacheKey = userMessage.toLowerCase().trim();
            if (answerCache.has(cacheKey)) {
                const cached = answerCache.get(cacheKey);
                if (Date.now() - cached.timestamp < CACHE_TTL) {
                    console.log(`[${new Date().toISOString()}] Cache hit for: "${userMessage.substring(0, 50)}..."`);
                    stats.cacheHits++;
                    stats.aiResponses++;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ response: cached.answer }));
                    return;
                }
            }
            
            const systemPrompt = getSystemPrompt(userMessage);
            stats.chatCalls++;
            stats.inputTokens += systemPrompt.length / 4; // Rough estimate

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
            
            stats.aiResponses++;
            stats.outputTokens += aiResponse.length / 4; // Rough estimate
            
            // Cache the answer
            answerCache.set(cacheKey, { answer: aiResponse, timestamp: Date.now() });
            stats.cachedAnswers = answerCache.size;
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: aiResponse }));
            
        } catch (error) {
            console.error('Gemini voice chat error:', error);
            stats.errors++;
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
