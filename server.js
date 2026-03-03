console.log('>>> OBIWON VOICE TUTOR V2.3-STABLE <<<');
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Import enhanced transcription modules
const { transcribe, CONFIG: TRANSCRIPTION_CONFIG, WHISPER_AVAILABLE } = require('./transcription-service');
const { validateAudio, preprocessAudio } = require('./audio-processor');

const PORT = 3003; // Forced for Cloudflare Tunnel alignment
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RAG_KNOWLEDGE_PATH = '/Users/obiwon/Documents/CLASSES/ESMOD-Creative-Tech-RAG/RAG_KNOWLEDGE_BASE.md';

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
    transcriptionSuccess: 0,
    transcriptionFailures: 0,
    whisperFallbacks: 0,
    lowConfidenceRetries: 0,
    avgConfidence: 0,
    totalConfidence: 0,
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

const VOICE_SITE_DIR = __dirname;

const server = http.createServer((req, res) => {
    console.log(`[REQ] ${new Date().toLocaleTimeString()} | ${req.method} | ${req.url}`);
    const urlPath = req.url.split('?')[0];

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
    if (req.method === 'POST' && urlPath === '/transcribe') {
        handleGeminiTranscription(req, res);
        return;
    }

    // Handle chat with Gemini (text only)
    if (req.method === 'POST' && urlPath === '/chat') {
        handleGeminiChat(req, res);
        return;
    }

    // Handle voice chat with Gemini (audio response)
    if (req.method === 'POST' && req.url === '/chat-voice') {
        handleGeminiVoiceChat(req, res);
        return;
    }

    // TTS endpoint
    if (req.method === 'POST' && urlPath === '/tts') {
        handleTTS(req, res);
        return;
    }

    // Serve the main HTML file from voice-site-redesign
    if (req.method === 'GET' && req.url === '/') {
        serveFile(res, path.join(VOICE_SITE_DIR, 'index.html'), 'text/html');
        return;
    }

    // Serve app-v2.js (handle query parameters like ?v=3)
    if ((req.method === 'GET' || req.method === 'HEAD') && (urlPath === '/app-v2.js' || urlPath === '/app.js')) {
        console.log(`[SERVE] Serving app-v2.js from: ${path.join(VOICE_SITE_DIR, 'app-v2.js')}`);
        serveFile(res, path.join(VOICE_SITE_DIR, 'app-v2.js'), 'application/javascript');
        return;
    }

    // Serve avatar image (Using obiwon-avatar.jpg as requested)
    if ((req.method === 'GET' || req.method === 'HEAD') && (urlPath.includes('portrait') || urlPath.includes('avatar'))) {
        serveFile(res, path.join(VOICE_SITE_DIR, 'obiwon-avatar.jpg'), 'image/jpeg');
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
            transcriptionSuccess: stats.transcriptionSuccess,
            transcriptionFailures: stats.transcriptionFailures,
            transcriptionSuccessRate: stats.transcriptionCalls > 0 ?
                ((stats.transcriptionSuccess / stats.transcriptionCalls) * 100).toFixed(1) : 0,
            whisperFallbacks: stats.whisperFallbacks,
            fallbackRate: stats.transcriptionSuccess > 0 ?
                ((stats.whisperFallbacks / stats.transcriptionSuccess) * 100).toFixed(1) : 0,
            lowConfidenceRetries: stats.lowConfidenceRetries,
            avgConfidence: stats.avgConfidence.toFixed(2),
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
            transcriptionConfig: {
                confidenceThreshold: TRANSCRIPTION_CONFIG.confidenceThreshold,
                useWhisperFallback: TRANSCRIPTION_CONFIG.useWhisperFallback,
                whisperAvailable: WHISPER_AVAILABLE,
                whisperModel: TRANSCRIPTION_CONFIG.whisperModel,
                maxRetries: TRANSCRIPTION_CONFIG.maxRetries
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
            version: '2.0-flash-optimized',
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
// TRANSCRIPTION CONFIGURATION
// (Audio processing functions now in audio-processor.js)
// ============================================

// ============================================
// ENHANCED TRANSCRIPTION HANDLER
// Uses transcription-service module with Whisper fallback
// ============================================
async function handleGeminiTranscription(req, res) {
    const chunks = [];
    let requestAborted = false;
    const requestStartTime = Date.now();

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

            // Validate audio using enhanced validator
            const validation = validateAudio(buffer);
            console.log(`[DEBUG] Audio received: ${buffer.length} bytes. ZeroRatio: ${validation.quality?.zeroRatio?.toFixed(4)}, Entropy: ${validation.quality?.entropy?.toFixed(4)}`);

            if (!validation.valid) {
                if (validation.code === 'TOO_SHORT') {
                    console.log(`[${new Date().toISOString()}] Audio too short: ${buffer.length} bytes`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        transcript: '',
                        message: 'Audio too short - please speak longer',
                        audioQuality: validation.quality
                    }));
                    return;
                }

                if (validation.code === 'SILENCE') {
                    console.log(`[${new Date().toISOString()}] Audio is mostly silence`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        transcript: '',
                        message: 'No speech detected. Please try speaking louder or closer to the microphone.',
                        audioQuality: validation.quality,
                        confidence: 0
                    }));
                    return;
                }

                console.log(`[${new Date().toISOString()}] Audio validation failed:`, validation.error);
                sendErrorResponse(res, 400, 'INVALID_AUDIO', validation.error);
                return;
            }


            stats.transcriptionCalls++;

            // Preprocess audio for better transcription accuracy
            console.log(`[${new Date().toISOString()}] Preprocessing audio (${validation.buffer.length} bytes, quality: ${validation.quality.quality})...`);
            const preprocessed = await preprocessAudio(validation.buffer);

            console.log(`[${new Date().toISOString()}] Transcribing audio (${preprocessed.buffer.length} bytes, processed: ${preprocessed.processed})...`);

            // Use enhanced transcription service with fallback
            const result = await transcribe(preprocessed.buffer, {
                useWhisperFallback: TRANSCRIPTION_CONFIG.useWhisperFallback
            });

            // Update stats
            stats.transcriptionSuccess++;
            stats.totalConfidence += result.confidence;
            stats.avgConfidence = stats.totalConfidence / stats.transcriptionSuccess;

            if (result.fallback) {
                stats.whisperFallbacks++;
            }

            if (result.confidence < TRANSCRIPTION_CONFIG.confidenceThreshold) {
                stats.lowConfidenceRetries++;
            }

            const duration = Date.now() - requestStartTime;

            console.log(`[${new Date().toISOString()}] Transcribed (${result.method}, confidence: ${result.confidence.toFixed(2)}, ${duration}ms): "${result.text.substring(0, 80)}${result.text.length > 80 ? '...' : ''}"`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                transcript: result.text,
                success: true,
                confidence: result.confidence,
                method: result.method,
                fallback: result.fallback || false,
                duration: duration,
                audioQuality: result.quality,
                attempts: result.attempts?.length || 1
            }));

        } catch (error) {
            stats.transcriptionFailures++;
            stats.errors++;

            console.error(`[${new Date().toISOString()}] Transcription error:`, error.message);

            sendErrorResponse(
                res,
                error.statusCode || 500,
                error.type || 'TRANSCRIPTION_FAILED',
                error.message || 'Transcription failed',
                {
                    retryable: error.type === 'RATE_LIMIT' ||
                        error.type === 'TIMEOUT' ||
                        error.type === 'NETWORK_ERROR' ||
                        error.type === 'SERVICE_ERROR'
                }
            );
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
 - BILINGUAL: You respond in the same language as the student (English or French). If the student speaks French, you are Obiwon coding/AI expert in French.
 
 WHAT YOU KNOW:
 - ESMOD Creative Tech course: AI tools, prompting, RODE framework, ethics, brand challenges
 - The grading rubrics (10 points: theme, ideas, AI use, constraints, presentation)
 - Era Bending Mix Board, Fashion Brand Challenge, Mini Exercise
 
 COURSE CONTEXT (Key Info):
 ${RAG_KNOWLEDGE}
 
 RULES:
 1. Answer the question concisely. Nothing more.
 2. One concrete example beats five abstract concepts.
 3. If they ask about grades/rubrics, be precise (points matter).
 4. If they ask "how do I..." give them the prompt or the step. Skip the philosophy.
 5. Wit is good. Rambling is bad.
 6. IMPORTANT FOR VOICE: NO asterisks (*), hashtags (#), or emojis. Speak conversationally.
 7. If responding in French, use your character's voice but adapted for the language.
 
 Student: ${userMessage}`;
}

// TTS endpoint for Kokoro
async function handleTTS(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            if (!body) return sendErrorResponse(res, 400, 'EMPTY_BODY', 'No request body');
            const data = JSON.parse(body);
            const text = data.text;
            const voice = data.voice || 'bm_daniel';

            if (!text) {
                return sendErrorResponse(res, 400, 'MISSING_TEXT', 'No text provided for TTS');
            }

            const fileName = `tts_${Date.now()}.wav`;
            const filePath = path.join(UPLOAD_DIR, fileName);
            console.log(`[TTS] Generating ${voice} for: "${text.substring(0, 50)}..."`);

            const pythonPath = path.join(__dirname, 'venv/bin/python3');
            const scriptPath = path.join(__dirname, 'kokoro_tts.py');

            // Ensure venv and script exist
            if (!fs.existsSync(pythonPath)) {
                console.error(`[TTS ERROR] Python venv missing at: ${pythonPath}`);
                return sendErrorResponse(res, 500, 'VENV_MISSING', 'Python VENV not found on server');
            }
            if (!fs.existsSync(scriptPath)) {
                console.error(`[TTS ERROR] scriptPath missing at: ${scriptPath}`);
                return sendErrorResponse(res, 500, 'SCRIPT_MISSING', 'kokoro_tts.py not found on server');
            }

            const cmd = `"${pythonPath}" "${scriptPath}" "${text.replace(/"/g, '\\"')}" "${filePath}" "${voice}"`;
            console.log(`[TTS] Executing: ${cmd}`);

            exec(cmd, (error, stdout, stderr) => {
                if (stdout) console.log(`[TTS STDOUT] ${stdout}`);
                if (stderr) console.log(`[TTS STDERR] ${stderr}`);

                if (error) {
                    console.error(`[TTS EXEC ERROR] code: ${error.code}`, stderr);
                    return sendErrorResponse(res, 500, 'TTS_EXEC_FAILED', stderr || 'Python script failed');
                }

                if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 100) {
                    console.error(`[TTS ERROR] Generated file is missing or too small: ${filePath}`);
                    return sendErrorResponse(res, 500, 'FILE_ERROR', 'Generated audio file is invalid');
                }

                console.log(`[TTS SUCCESS] Generated: ${filePath} (${fs.statSync(filePath).size} bytes)`);
                res.writeHead(200, {
                    'Content-Type': 'audio/wav',
                    'Content-Length': fs.statSync(filePath).size,
                    'X-TTS-Voice': voice
                });
                const stream = fs.createReadStream(filePath);
                stream.pipe(res);

                // Cleanup after streaming
                res.on('finish', () => {
                    setTimeout(() => {
                        fs.unlink(filePath, () => { });
                    }, 5000);
                });
            });

        } catch (error) {
            console.error('TTS request error:', error);
            sendErrorResponse(res, 500, 'SERVER_ERROR', error.message);
        }
    });
}

// Simple test endpoint to verify audio pipeline
async function handleTestAudio(req, res) {
    const instanceId = Math.random().toString(36).substring(7);
    const text = "Hello! This is a test of the Obiwon voice system. If you hear this, audio is working.";
    const voice = "bm_daniel";
    const fileName = `test_${instanceId}_${Date.now()}.wav`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    const pythonPath = path.join(__dirname, 'venv/bin/python3');
    const scriptPath = path.join(__dirname, 'kokoro_tts.py');

    console.log(`[TEST][${instanceId}] Starting audio generation...`);

    const cmd = `"${pythonPath}" "${scriptPath}" "${text}" "${filePath}" "${voice}"`;
    exec(cmd, (error, stdout, stderr) => {
        if (stdout) console.log(`[TEST][${instanceId}] STDOUT: ${stdout}`);
        if (stderr) console.log(`[TEST][${instanceId}] STDERR: ${stderr}`);

        if (error) {
            console.error(`[TEST][${instanceId}] EXEC ERROR:`, error.message);
            return res.writeHead(500).end(`Test Failed: ${stderr || error.message}`);
        }

        const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
        console.log(`[TEST][${instanceId}] SUCCESS: Generated ${size} bytes`);

        res.writeHead(200, {
            'Content-Type': 'audio/wav',
            'Content-Length': size,
            'X-Instance-ID': instanceId
        });
        fs.createReadStream(filePath).pipe(res);
    });
}

// Isolation test: generate a pure sine wave beep in memory
function handleDebugAudio(req, res) {
    console.log(`[DEBUG-AUDIO] Generating isolation beep...`);
    const sampleRate = 44100;
    const durationSeconds = 2;
    const frequency = 440; // A4
    const numSamples = sampleRate * durationSeconds;

    // Simple WAV header for mono 16-bit PCM
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + numSamples * 2, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // Mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(numSamples * 2, 40);

    const data = Buffer.alloc(numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
        const value = Math.sin(2 * Math.PI * frequency * i / sampleRate);
        data.writeInt16LE(Math.floor(value * 32767), i * 2);
    }

    res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': header.length + data.length
    });
    res.write(header);
    res.end(data);
    console.log(`[DEBUG-AUDIO] Beep sent to client.`);
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

            console.log(`[${new Date().toISOString()}]Gemini chat: "${userMessage.substring(0, 50)}..."`);

            // Check cache first
            const cacheKey = userMessage.toLowerCase().trim();
            if (answerCache.has(cacheKey)) {
                const cached = answerCache.get(cacheKey);
                if (Date.now() - cached.timestamp < CACHE_TTL) {
                    console.log(`[${new Date().toISOString()}]Cache hit for: "${userMessage.substring(0, 50)}..."`);
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
                    contents: [{ parts: [{ text: systemPrompt }] }],
                    generationConfig: { maxOutputTokens: 250, temperature: 0.7 }
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
                    contents: [{ parts: [{ text: systemPrompt }] }],
                    generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
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
    console.log(`[DEBUG] Attempting to serve file: ${filePath}`);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(`[ERROR] Failed to read file: ${filePath} - ${err.message}`);
            res.writeHead(404);
            res.end(`File not found: ${path.basename(filePath)}`);
            return;
        }
        console.log(`[SUCCESS] Serving ${filePath} (${data.length} bytes)`);
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
    console.log(`🎙️ Voice: Gemini Transcription + Whisper Fallback`);
    console.log(`   └─ Confidence threshold: ${TRANSCRIPTION_CONFIG.confidenceThreshold}`);
    console.log(`   └─ Whisper fallback: ${TRANSCRIPTION_CONFIG.useWhisperFallback ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   └─ Whisper available: ${WHISPER_AVAILABLE ? '✅ Yes' : '❌ No'}`);
    console.log(`   └─ Whisper model: ${TRANSCRIPTION_CONFIG.whisperModel}`);
    console.log(`🌐 For remote access: Cloudflare Tunnel active at voice.artgenies.com`);
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
                    fs.unlink(filePath, () => { });
                }
            });
        });
    });
}, 600000);
