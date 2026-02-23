/**
 * Transcription Service Module
 * Multi-provider transcription with fallback support
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const { analyzeAudioQuality, detectMimeType, calculateConfidence, applyCorrections } = require('./audio-processor');

// Configuration
const CONFIG = {
  // Gemini settings
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiTimeout: 30000,
  geminiModel: 'gemini-2.0-flash',

  // Whisper settings - check multiple possible locations
  whisperPath: process.env.WHISPER_PATH || '/opt/homebrew/bin/whisper',
  whisperModel: process.env.WHISPER_MODEL || 'large-v3-turbo',
  whisperTimeout: 60000,
  useWhisperFallback: process.env.USE_WHISPER_FALLBACK !== 'false',

  // OpenAI Whisper API (optional)
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Groq Whisper API (Fastest STT)
  groqApiKey: process.env.GROQ_API_KEY,

  // Retry settings
  maxRetries: 3,
  retryDelayBase: 1000,
  confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.6
};

// Enhanced transcription prompt optimized for maximum accuracy
const TRANSCRIPTION_PROMPT = `Transcribe this English audio to text with maximum accuracy. Follow these guidelines carefully:

ACCURACY REQUIREMENTS:
- Listen carefully to every word and transcribe EXACTLY what is spoken
- Preserve all punctuation, capitalization, and natural speech patterns
- The speaker may have various accents (British, American, European) - adapt to their pronunciation
- If words are slurred or run together, infer the most likely intended words

CONTENT CONTEXT:
- The speaker is likely discussing AI, Creative Technology, or the ESMOD fashion/creative course
- Common domain terms to recognize accurately: AI, ESMOD, RODE framework, Creative Tech, Midjourney, ChatGPT, Stable Diffusion, moodboard, brand challenge, runway, collection, silhouette, textile, garment, atelier, haute couture, prêt-à-porter, diffusion line, capsule collection, lookbook

AUDIO QUALITY HANDLING:
- Ignore background noise, music, or non-speech sounds
- Focus on clear speech patterns and vocal frequencies
- If audio is muffled, try to extract intelligible words
- If the speaker stutters or repeats, include all instances naturally
- If multiple people speak, transcribe only the LOUDEST/CLEAREST voice

OUTPUT RULES:
- Return ONLY the spoken words - no explanations, timestamps, or formatting
- If no intelligible speech is detected, respond with exactly: [no speech detected]
- If speech is partially unclear, transcribe what you can hear clearly and use [inaudible] for unclear sections
- Do not add commentary like "The speaker said..." or "Transcription:"
- Maintain natural contractions (don't, I'm, won't) as spoken
- Numbers should be written as digits if spoken as numbers ("5" not "five")`;

// Fallback prompt for challenging audio (simpler, more direct)
const FALLBACK_TRANSCRIPTION_PROMPT = `Transcribe this audio. Speak clearly, ignore noise. Return only the words spoken, nothing else. If unclear: [no speech detected]`;

/**
 * Sleep helper for delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Transcribe using Gemini API
 * @param {Buffer} audioBuffer - Audio data
 * @param {string} mimeType - MIME type
 * @param {Object} options - Optional settings including retry attempt number
 * @returns {Promise<Object>} Transcription result
 */
async function transcribeWithGemini(audioBuffer, mimeType, options = {}) {
  if (!CONFIG.geminiApiKey) {
    throw { type: 'CONFIG_ERROR', message: 'Gemini API key not configured' };
  }

  const { attempt = 1, useFallbackPrompt = false } = options;

  // Use simpler prompt on later retry attempts
  const prompt = (useFallbackPrompt || attempt > 2) ? FALLBACK_TRANSCRIPTION_PROMPT : TRANSCRIPTION_PROMPT;

  const base64Audio = audioBuffer.toString('base64');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.geminiTimeout);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: mimeType, data: base64Audio } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.1,  // Low temperature for more deterministic output
            topP: 0.8,
            topK: 40
          }
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw {
        type: response.status === 429 ? 'RATE_LIMIT' :
          response.status >= 500 ? 'SERVICE_ERROR' : 'API_ERROR',
        statusCode: response.status,
        message: error.error?.message || `HTTP ${response.status}`
      };
    }

    const data = await response.json();

    if (data.error) {
      throw {
        type: 'API_ERROR',
        message: data.error.message
      };
    }

    const candidate = data.candidates?.[0];
    if (!candidate || candidate.finishReason === 'SAFETY') {
      throw { type: 'CONTENT_BLOCKED', message: 'Content blocked by safety filters' };
    }

    const text = candidate.content?.parts?.[0]?.text || '';

    return {
      text: text.trim(),
      method: 'gemini',
      rawResponse: data,
      promptType: useFallbackPrompt ? 'fallback' : 'standard'
    };

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw { type: 'TIMEOUT', message: 'Transcription request timed out' };
    }
    throw error;
  }
}

/**
 * Check if Whisper is available at various possible paths
 * @returns {Object} {available: boolean, path: string}
 */
function findWhisper() {
  const possiblePaths = [
    CONFIG.whisperPath,
    '/opt/homebrew/bin/whisper',
    '/usr/local/bin/whisper',
    '/Users/obiwon/.openclaw/workspace/skills/voice-agent/venv/bin/whisper',
    './venv/bin/whisper',
    'whisper' // Try PATH
  ];

  for (const whisperPath of possiblePaths) {
    try {
      const result = require('child_process').execSync(`"${whisperPath}" --version 2>/dev/null || ${whisperPath} --version 2>/dev/null`, {
        encoding: 'utf8',
        timeout: 5000,
        shell: true
      });
      if (result.toLowerCase().includes('whisper')) {
        console.log(`[Transcription] Found Whisper at: ${whisperPath}`);
        return { available: true, path: whisperPath };
      }
    } catch (e) {
      // Try next path
    }
  }

  return { available: false, path: CONFIG.whisperPath };
}

/**
 * Check if Whisper is available (legacy compatibility)
 * @returns {boolean}
 */
function isWhisperAvailable() {
  const found = findWhisper();
  if (found.available) {
    // Update the config path if found elsewhere
    CONFIG.whisperPath = found.path;
  }
  return found.available;
}

// Check Whisper availability on module load
const WHISPER_AVAILABLE = isWhisperAvailable();
if (!WHISPER_AVAILABLE) {
  console.warn('[Transcription] Whisper not available at:', CONFIG.whisperPath);
}

/**
 * Transcribe using local Whisper
 * @param {Buffer} audioBuffer - Audio data
 * @param {string} mimeType - MIME type
 * @returns {Promise<Object>} Transcription result
 */
async function transcribeWithLocalWhisper(audioBuffer, mimeType) {
  if (!WHISPER_AVAILABLE) {
    throw { type: 'WHISPER_NOT_AVAILABLE', message: 'Whisper is not installed or not found at ' + CONFIG.whisperPath };
  }

  const tempDir = '/tmp/whisper-transcriptions';
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const timestamp = Date.now();

  // Map MIME types to appropriate file extensions
  const extensionMap = {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac'
  };

  const inputExt = extensionMap[mimeType] || 'webm';
  const inputFile = path.join(tempDir, `input_${timestamp}.${inputExt}`);

  console.log(`[Transcription] Whisper input: ${mimeType} -> .${inputExt}`);

  try {
    // Write audio to temp file with correct extension
    await writeFileAsync(inputFile, audioBuffer);

    // Run Whisper with optimized settings for accuracy
    const args = [
      inputFile,
      '--model', CONFIG.whisperModel,
      '--language', 'en',
      '--task', 'transcribe',
      '--output_format', 'txt',
      '--output_dir', tempDir,
      '--fp16', 'False',
      '--verbose', 'False',
      '--condition_on_previous_text', 'True',
      '--temperature', '0.0',
      '--best_of', '5',
      '--beam_size', '5'
    ];

    console.log(`[Transcription] Running Whisper with model: ${CONFIG.whisperModel}`);

    const result = await new Promise((resolve, reject) => {
      const whisper = spawn(CONFIG.whisperPath, args);
      let stdout = '';
      let stderr = '';

      whisper.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      whisper.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log progress for debugging
        if (stderr.includes('%')) {
          const progress = stderr.match(/(\d+)%/);
          if (progress) {
            console.log(`[Whisper] Progress: ${progress[1]}%`);
          }
        }
      });

      // Timeout
      const timeout = setTimeout(() => {
        whisper.kill('SIGTERM');
        reject({ type: 'TIMEOUT', message: 'Whisper transcription timed out after ' + CONFIG.whisperTimeout + 'ms' });
      }, CONFIG.whisperTimeout);

      whisper.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject({ type: 'WHISPER_ERROR', message: `Whisper exited with code ${code}: ${stderr}` });
        }
      });

      whisper.on('error', (err) => {
        clearTimeout(timeout);
        reject({ type: 'WHISPER_ERROR', message: err.message });
      });
    });

    // Read output file (Whisper saves to {input_filename}.txt)
    const outputFile = path.join(tempDir, `input_${timestamp}.txt`);
    let transcription = '';

    if (fs.existsSync(outputFile)) {
      transcription = fs.readFileSync(outputFile, 'utf8').trim();
      console.log(`[Transcription] Whisper output file read: ${outputFile}`);
    } else {
      // Fallback: try to find any .txt file in temp dir created recently
      const files = fs.readdirSync(tempDir);
      const txtFile = files.find(f => f.endsWith('.txt') && f.includes(`${timestamp}`));
      if (txtFile) {
        transcription = fs.readFileSync(path.join(tempDir, txtFile), 'utf8').trim();
        console.log(`[Transcription] Whisper output found: ${txtFile}`);
      } else {
        // Last resort: parse stdout
        transcription = result.stdout.trim();
        console.log(`[Transcription] Using stdout as fallback`);
      }
    }

    if (!transcription) {
      throw { type: 'WHISPER_EMPTY', message: 'Whisper returned empty transcription' };
    }

    console.log(`[Transcription] Whisper result: "${transcription.substring(0, 60)}${transcription.length > 60 ? '...' : ''}"`);

    return {
      text: transcription,
      method: 'whisper-local',
      model: CONFIG.whisperModel
    };

  } finally {
    // Cleanup
    try {
      if (fs.existsSync(inputFile)) await unlinkAsync(inputFile);
      const outputFile = path.join(tempDir, `input_${timestamp}.txt`);
      if (fs.existsSync(outputFile)) await unlinkAsync(outputFile);
      // Also clean up any VTT or other output files
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        if (file.includes(`${timestamp}`)) {
          await unlinkAsync(path.join(tempDir, file)).catch(() => { });
        }
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Transcribe using Groq Whisper API (Fastest STT)
 * @param {Buffer} audioBuffer - Audio data
 * @param {string} mimeType - MIME type
 * @returns {Promise<Object>} Transcription result
 */
async function transcribeWithGroq(audioBuffer, mimeType) {
  if (!CONFIG.groqApiKey) {
    throw { type: 'CONFIG_ERROR', message: 'Groq API key not configured' };
  }

  const formData = new FormData();
  const extensionMap = {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac'
  };
  const ext = extensionMap[mimeType] || 'webm';
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', blob, `audio.${ext}`);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('prompt', TRANSCRIPTION_PROMPT);
  formData.append('language', 'en');
  formData.append('response_format', 'json');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.geminiTimeout);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.groqApiKey}`
      },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw { type: 'API_ERROR', message: `Groq API error: ${response.status} - ${errText}` };
    }

    const data = await response.json();

    return {
      text: data.text,
      method: 'groq-whisper',
      confidence: 0.95
    };

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw { type: 'TIMEOUT', message: 'Groq transcription request timed out' };
    }
    throw error;
  }
}

/**
 * Transcribe using OpenAI Whisper API
 * @param {Buffer} audioBuffer - Audio data
 * @returns {Promise<Object>} Transcription result
 */
async function transcribeWithOpenAI(audioBuffer) {
  if (!CONFIG.openaiApiKey) {
    throw { type: 'CONFIG_ERROR', message: 'OpenAI API key not configured' };
  }

  // Write to temp file for multipart upload
  const tempFile = `/ tmp / openai_audio_${Date.now()}.webm`;
  await writeFileAsync(tempFile, audioBuffer);

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.openaiApiKey}`
      },
      body: new FormData()
    });

    // Note: Proper FormData with file requires additional handling
    // This is a simplified version - full implementation would use form-data package

    if (!response.ok) {
      throw { type: 'API_ERROR', message: `OpenAI API error: ${response.status}` };
    }

    const data = await response.json();

    return {
      text: data.text,
      method: 'whisper-api',
      confidence: 0.9  // OpenAI doesn't provide confidence scores
    };

  } finally {
    try {
      await unlinkAsync(tempFile);
    } catch (e) { }
  }
}

/**
 * Main transcription function with retry and fallback logic
 * @param {Buffer} audioBuffer - Audio data
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} Transcription result with confidence
 */
async function transcribe(audioBuffer, options = {}) {
  const quality = analyzeAudioQuality(audioBuffer);
  const mimeType = detectMimeType(audioBuffer);

  const startTime = Date.now();
  let lastError = null;
  let result = null;
  let attempts = [];

  // Try Groq API first (fastest)
  if (CONFIG.groqApiKey) {
    try {
      console.log(`[Transcription] Attempting Groq Whisper transcription...`);
      const groqResult = await transcribeWithGroq(audioBuffer, mimeType);

      result = {
        text: applyCorrections(groqResult.text),
        rawText: groqResult.text,
        confidence: groqResult.confidence,
        method: 'groq-whisper',
        duration: Date.now() - startTime,
        attempts: 1,
        quality: quality
      };
      attempts.push({ method: 'groq', attempt: 1, confidence: groqResult.confidence, success: true });

      if (result.text) {
        return result;
      }
    } catch (error) {
      lastError = error;
      attempts.push({ method: 'groq', attempt: 1, error: error.type, success: false });
      console.log(`[Transcription] Groq attempt failed: ${error.type || error.message}`);
    }
  }

  // Try Gemini fallback (slower but reliable)
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      // Use fallback prompt on later attempts
      const useFallbackPrompt = attempt > 1;

      const geminiResult = await transcribeWithGemini(audioBuffer, mimeType, {
        attempt,
        useFallbackPrompt
      });

      // Calculate confidence
      const estimatedDuration = quality.estimatedDuration || 1;
      const confidence = calculateConfidence(quality, geminiResult.text, estimatedDuration);

      result = {
        text: applyCorrections(geminiResult.text),
        rawText: geminiResult.text,
        confidence: confidence,
        method: 'gemini',
        duration: Date.now() - startTime,
        attempts: attempt,
        quality: quality
      };

      attempts.push({
        method: 'gemini',
        attempt,
        confidence,
        success: true,
        promptType: geminiResult.promptType
      });

      // If confidence is good enough, return immediately
      if (confidence >= CONFIG.confidenceThreshold) {
        return result;
      }

      // Log low confidence for debugging
      console.log(`[Transcription] Gemini attempt ${attempt} confidence ${confidence.toFixed(2)} below threshold ${CONFIG.confidenceThreshold}`);

      // Otherwise, try Whisper fallback
      if (CONFIG.useWhisperFallback && attempt === CONFIG.maxRetries) {
        console.log(`[Transcription] Gemini confidence ${confidence.toFixed(2)} below threshold, trying Whisper fallback...`);
      }

      // If not last attempt, continue to retry with fallback prompt
      if (attempt < CONFIG.maxRetries) {
        const delay = Math.min(CONFIG.retryDelayBase * Math.pow(2, attempt - 1), 8000);
        await sleep(delay);
      }

    } catch (error) {
      lastError = error;
      attempts.push({ method: 'gemini', attempt, error: error.type, success: false });

      console.log(`[Transcription] Gemini attempt ${attempt} failed: ${error.type || error.message}`);

      // Don't retry on certain errors
      if (error.type === 'INVALID_REQUEST' || error.type === 'CONFIG_ERROR' ||
        error.type === 'CONTENT_BLOCKED') {
        break;
      }

      if (attempt < CONFIG.maxRetries) {
        const delay = Math.min(CONFIG.retryDelayBase * Math.pow(2, attempt - 1), 8000);
        console.log(`[Transcription] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  // Try Whisper fallback if Gemini failed or had low confidence
  if (CONFIG.useWhisperFallback && WHISPER_AVAILABLE && (!result || result.confidence < CONFIG.confidenceThreshold)) {
    try {
      console.log(`[Transcription] Attempting Whisper fallback(Gemini confidence: ${result?.confidence?.toFixed(2) || 'N/A'})...`);

      const whisperResult = await transcribeWithLocalWhisper(audioBuffer, mimeType);

      // Calculate Whisper confidence based on text length and quality
      const whisperWords = whisperResult.text.split(/\s+/).length;
      const estimatedDuration = quality.estimatedDuration || 1;
      const wordsPerSecond = whisperWords / estimatedDuration;

      // Whisper is generally very accurate for clear speech (0.85-0.95)
      // Adjust confidence based on speaking rate (normal is 2-3 wps)
      let whisperConfidence = 0.9;
      if (wordsPerSecond < 0.5 || wordsPerSecond > 7) {
        whisperConfidence = 0.75; // Unusual speaking rate
      }
      if (quality.quality === 'poor') {
        whisperConfidence -= 0.1;
      }

      // Use Whisper result if it's better or if Gemini had very low confidence
      const shouldUseWhisper = !result || whisperConfidence > result.confidence || result.confidence < 0.4;

      if (shouldUseWhisper) {
        result = {
          text: applyCorrections(whisperResult.text),
          rawText: whisperResult.text,
          confidence: whisperConfidence,
          method: 'whisper-local',
          model: CONFIG.whisperModel,
          duration: Date.now() - startTime,
          attempts: attempts.length + 1,
          quality: quality,
          fallback: true
        };
        attempts.push({ method: 'whisper', attempt: 1, confidence: whisperConfidence, success: true });
        console.log(`[Transcription] Using Whisper result(confidence: ${whisperConfidence.toFixed(2)})`);
      } else {
        console.log(`[Transcription] Keeping Gemini result(confidence: ${result.confidence.toFixed(2)} > ${whisperConfidence.toFixed(2)})`);
      }

    } catch (whisperError) {
      console.error('[Transcription] Whisper fallback failed:', whisperError.type || whisperError.message);
      attempts.push({ method: 'whisper', attempt: 1, error: whisperError.type || 'UNKNOWN', success: false });
    }
  } else if (CONFIG.useWhisperFallback && !WHISPER_AVAILABLE) {
    console.log('[Transcription] Whisper fallback skipped - not available');
  }

  // Handle no result case
  if (!result) {
    throw lastError || { type: 'TRANSCRIPTION_FAILED', message: 'All transcription methods failed' };
  }

  // Clean up the result text
  if (result.text) {
    // Remove common artifacts
    result.text = result.text
      .replace(/^\[\s*no speech detected\s*\]$/i, '')
      .replace(/^\[\s*silence\s*\]$/i, '')
      .trim();

    // If empty after cleanup, mark as no speech
    if (!result.text) {
      result.confidence = 0.1;
      result.noSpeech = true;
    }
  }

  result.attempts = attempts;
  return result;
}

/**
 * Quick transcription for real-time use (Gemini only, no fallback)
 * @param {Buffer} audioBuffer - Audio data
 * @returns {Promise<Object>} Transcription result
 */
async function transcribeQuick(audioBuffer) {
  const mimeType = detectMimeType(audioBuffer);
  const result = await transcribeWithGemini(audioBuffer, mimeType);

  return {
    text: applyCorrections(result.text),
    method: 'gemini',
    confidence: 0.8  // Assume good for quick mode
  };
}

module.exports = {
  transcribe,
  transcribeQuick,
  transcribeWithGemini,
  transcribeWithLocalWhisper,
  transcribeWithOpenAI,
  TRANSCRIPTION_PROMPT,
  FALLBACK_TRANSCRIPTION_PROMPT,
  CONFIG,
  WHISPER_AVAILABLE
};
