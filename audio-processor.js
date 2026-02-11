/**
 * Audio Processor Module
 * Preprocesses audio for better transcription accuracy
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// Audio processing configuration
const AUDIO_CONFIG = {
  // Sample rate for processing (WebM/Opus typically uses 48kHz, we normalize to 44.1kHz)
  targetSampleRate: 44100,
  
  // Audio quality thresholds
  minSilenceThreshold: 0.02,      // 2% silence is acceptable
  maxSilenceThreshold: 0.95,      // 95% silence = reject
  minVolumeDb: -40,               // Minimum acceptable volume (dB)
  targetVolumeDb: -16,            // Target normalized volume (dB)
  
  // Silence trimming
  silenceDb: -50,                 // dB threshold for silence
  minSilenceDuration: 0.3,        // seconds of silence to trim
  
  // Format preferences
  preferredFormat: 'wav',         // Intermediate format for processing
  outputFormat: 'webm'            // Final output format
};

/**
 * Analyze audio quality without processing
 * @param {Buffer} buffer - Audio buffer
 * @returns {Object} Quality metrics
 */
function analyzeAudioQuality(buffer) {
  const hasWebmHeader = buffer.length > 4 && 
    (buffer.toString('hex', 0, 4) === '1a45dfa3' || // EBML header (WebM)
     buffer.toString('ascii', 0, 4) === 'RIFF' ||   // WAV header
     buffer.toString('hex', 0, 2) === 'ffe3' ||     // MP3 header
     buffer.toString('hex', 0, 2) === 'fff3');      // MP3 header variant
  
  // Calculate audio entropy (measure of randomness/signal)
  const sampleSize = Math.min(buffer.length, 2048);
  let zeroCount = 0;
  let byteSum = 0;
  let byteSqSum = 0;
  
  // Sample at intervals to avoid bias
  const step = Math.floor(buffer.length / sampleSize);
  for (let i = 0; i < sampleSize && (i * step) < buffer.length; i++) {
    const byte = buffer[i * step];
    if (byte === 0) zeroCount++;
    byteSum += byte;
    byteSqSum += byte * byte;
  }
  
  const zeroRatio = zeroCount / sampleSize;
  const mean = byteSum / sampleSize;
  const variance = (byteSqSum / sampleSize) - (mean * mean);
  const entropy = Math.sqrt(variance); // Standard deviation as entropy measure
  
  // Estimate duration (rough approximation for WebM Opus)
  // Opus typically uses 20ms frames, ~160 bytes per frame at 24kbps
  const estimatedDuration = buffer.length > 1000 ? 
    Math.max(0.5, (buffer.length - 500) / 3000) : 0; // Rough estimate
  
  return {
    hasValidHeader: hasWebmHeader,
    zeroRatio: zeroRatio,
    isMostlySilence: zeroRatio > AUDIO_CONFIG.maxSilenceThreshold,
    isLowSignal: entropy < 10,
    size: buffer.length,
    estimatedDuration: estimatedDuration,
    entropy: entropy,
    quality: zeroRatio < AUDIO_CONFIG.minSilenceThreshold ? 'good' :
             zeroRatio < 0.5 ? 'fair' : 'poor',
    recommended: zeroRatio < AUDIO_CONFIG.maxSilenceThreshold && entropy > 5
  };
}

/**
 * Detect MIME type from audio buffer
 * @param {Buffer} buffer - Audio buffer
 * @returns {string} MIME type
 */
function detectMimeType(buffer) {
  if (buffer.length < 4) return 'audio/webm';
  
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
  
  // FLAC
  if (asciiHeader.startsWith('fLaC')) return 'audio/flac';
  
  return 'audio/webm';
}

/**
 * Check if ffmpeg is available
 * @returns {boolean}
 */
function isFfmpegAvailable() {
  try {
    require('child_process').execSync('ffmpeg -version', { encoding: 'utf8', timeout: 5000 });
    return true;
  } catch (e) {
    return false;
  }
}

const FFMPEG_AVAILABLE = isFfmpegAvailable();

/**
 * Preprocess audio buffer using ffmpeg for optimal transcription
 * - Normalizes volume to target level
 * - Trims silence from start/end
 * - Converts to consistent format (44.1kHz mono WAV)
 * @param {Buffer} buffer - Input audio buffer
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processed audio and metadata
 */
async function preprocessAudio(buffer, options = {}) {
  const quality = analyzeAudioQuality(buffer);
  
  // Early rejection for obviously bad audio
  if (quality.isMostlySilence) {
    return {
      buffer: buffer,
      quality: quality,
      processed: false,
      error: 'Audio appears to be mostly silence',
      confidence: 0.1
    };
  }
  
  // If ffmpeg is not available or audio is already good quality and not forced
  if (!FFMPEG_AVAILABLE || (quality.quality === 'good' && !options.forceProcessing)) {
    if (!FFMPEG_AVAILABLE) {
      console.log('[AudioProcessor] FFmpeg not available, skipping preprocessing');
    }
    return {
      buffer: buffer,
      quality: quality,
      processed: false,
      confidence: quality.quality === 'good' ? 0.85 : 
                  quality.quality === 'fair' ? 0.7 : 0.5
    };
  }
  
  const tempDir = '/tmp/audio-preprocessing';
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const timestamp = Date.now();
  const inputFile = path.join(tempDir, `input_${timestamp}.webm`);
  const outputFile = path.join(tempDir, `output_${timestamp}.wav`);
  
  try {
    // Write input buffer to temp file
    fs.writeFileSync(inputFile, buffer);
    
    // Build ffmpeg command for audio optimization
    // -i: input file
    // -af: audio filter with loudnorm (EBU R128 loudness normalization) and silenceremove
    // -ar: sample rate 44100
    // -ac: mono channel
    // -c:a: pcm_s16le codec (16-bit PCM)
    const ffmpegArgs = [
      '-y',  // Overwrite output
      '-i', inputFile,
      '-af', `silenceremove=start_periods=1:start_duration=0.1:start_threshold=${AUDIO_CONFIG.silenceDb}dB:end_periods=1:end_duration=0.1:end_threshold=${AUDIO_CONFIG.silenceDb}dB,loudnorm=I=${AUDIO_CONFIG.targetVolumeDb}:TP=-1.5:LRA=11`,
      '-ar', '44100',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-f', 'wav',
      outputFile
    ];
    
    console.log(`[AudioProcessor] Running ffmpeg preprocessing...`);
    
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });
      
      ffmpeg.on('error', (err) => {
        reject(err);
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        ffmpeg.kill('SIGTERM');
        reject(new Error('FFmpeg processing timeout'));
      }, 30000);
    });
    
    // Read processed audio
    if (!fs.existsSync(outputFile)) {
      throw new Error('FFmpeg output file not created');
    }
    
    const processedBuffer = fs.readFileSync(outputFile);
    
    // Analyze processed audio quality
    const processedQuality = analyzeAudioQuality(processedBuffer);
    
    console.log(`[AudioProcessor] Preprocessing complete: ${buffer.length}B → ${processedBuffer.length}B, quality: ${processedQuality.quality}`);
    
    return {
      buffer: processedBuffer,
      quality: processedQuality,
      processed: true,
      originalSize: buffer.length,
      processedSize: processedBuffer.length,
      confidence: processedQuality.quality === 'good' ? 0.9 : 
                  processedQuality.quality === 'fair' ? 0.75 : 0.55
    };
    
  } catch (error) {
    console.error('[AudioProcessor] Preprocessing failed:', error.message);
    // Return original buffer on error
    return {
      buffer: buffer,
      quality: quality,
      processed: false,
      error: error.message,
      confidence: quality.quality === 'good' ? 0.8 : 
                  quality.quality === 'fair' ? 0.65 : 0.45
    };
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Quick audio preprocessing without ffmpeg (for fallback)
 * Just validates and returns metadata
 * @param {Buffer} buffer - Input audio buffer
 * @returns {Object} Processing result
 */
function preprocessAudioQuick(buffer) {
  const quality = analyzeAudioQuality(buffer);
  
  return {
    buffer: buffer,
    quality: quality,
    processed: false,
    confidence: quality.quality === 'good' ? 0.85 : 
                quality.quality === 'fair' ? 0.7 : 0.5
  };
}

/**
 * Calculate transcription confidence based on audio quality and result
 * @param {Object} quality - Audio quality metrics
 * @param {string} transcript - Transcription result
 * @param {number} duration - Audio duration in seconds
 * @returns {number} Confidence score (0-1)
 */
function calculateConfidence(quality, transcript, duration) {
  let confidence = 0.5;
  
  // Base confidence from audio quality
  if (quality.quality === 'good') confidence += 0.2;
  else if (quality.quality === 'fair') confidence += 0.1;
  else confidence -= 0.2;
  
  // Adjust for zero ratio (silence)
  confidence -= (quality.zeroRatio * 0.3);
  
  // Adjust for signal entropy
  if (quality.entropy > 30) confidence += 0.1;
  else if (quality.entropy < 10) confidence -= 0.2;
  
  // Check transcription reasonableness
  if (transcript && transcript.length > 0) {
    const words = transcript.trim().split(/\s+/).length;
    const wordsPerSecond = duration > 0 ? words / duration : 0;
    
    // Typical speech is 2-4 words per second
    if (wordsPerSecond >= 1 && wordsPerSecond <= 6) {
      confidence += 0.1;
    } else if (wordsPerSecond > 8 || wordsPerSecond < 0.5) {
      confidence -= 0.15;
    }
    
    // Empty or very short transcripts
    if (words < 1) {
      confidence = 0.1;
    }
  } else {
    confidence = 0.05;
  }
  
  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Validate audio before transcription
 * @param {Buffer} buffer - Audio buffer
 * @returns {Object} Validation result
 */
function validateAudio(buffer) {
  const MIN_AUDIO_SIZE = 1000;      // 1KB minimum
  const MAX_AUDIO_SIZE = 10 * 1024 * 1024;  // 10MB maximum
  const GEMINI_AUDIO_LIMIT = 8000000;  // ~8MB for Gemini API
  
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'No audio data received' };
  }
  
  if (buffer.length < MIN_AUDIO_SIZE) {
    return { valid: false, error: 'Audio too short', code: 'TOO_SHORT' };
  }
  
  if (buffer.length > MAX_AUDIO_SIZE) {
    return { valid: false, error: 'Audio file too large', code: 'TOO_LARGE' };
  }
  
  const quality = analyzeAudioQuality(buffer);
  
  if (quality.isMostlySilence) {
    return { 
      valid: false, 
      error: 'Audio appears to be mostly silence', 
      code: 'SILENCE',
      quality: quality 
    };
  }
  
  // Truncate if needed for Gemini
  let processedBuffer = buffer;
  if (buffer.length > GEMINI_AUDIO_LIMIT) {
    processedBuffer = buffer.slice(0, GEMINI_AUDIO_LIMIT);
  }
  
  return { 
    valid: true, 
    buffer: processedBuffer,
    quality: quality,
    truncated: buffer.length > GEMINI_AUDIO_LIMIT
  };
}

/**
 * Apply domain-specific text corrections
 * @param {string} text - Raw transcription
 * @returns {string} Corrected text
 */
function applyCorrections(text) {
  if (!text || typeof text !== 'string') return text;
  
  let corrected = text;
  
  // Common homophone and speech recognition corrections
  const corrections = [
    // AI/Creative Tech terms
    { pattern: /\beye\s+(tools?|for|in)\b/gi, replacement: 'AI $1' },
    { pattern: /\ba\s+i\s+/gi, replacement: 'AI ' },
    { pattern: /\besmod\b/gi, replacement: 'ESMOD' },
    { pattern: /\bezmod\b/gi, replacement: 'ESMOD' },
    { pattern: /\brode\b/gi, replacement: 'RODE' },
    { pattern: /\broad\b(?=.*framework)/gi, replacement: 'RODE' },
    
    // Common tech terms
    { pattern: /\bchat\s*gpt\b/gi, replacement: 'ChatGPT' },
    { pattern: /\bmid\s*journey\b/gi, replacement: 'Midjourney' },
    { pattern: /\bstable\s*diffusion\b/gi, replacement: 'Stable Diffusion' },
    { pattern: /\bphoto\s*shop\b/gi, replacement: 'Photoshop' },
    { pattern: /\bjava\s+script\b/gi, replacement: 'JavaScript' },
    { pattern: /\btype\s+script\b/gi, replacement: 'TypeScript' },
    
    // Creative terms
    { pattern: /\bmood\s*board\b/gi, replacement: 'moodboard' },
    { pattern: /\bbrain\s*storm\b/gi, replacement: 'brainstorm' },
    { pattern: /\bstory\s*board\b/gi, replacement: 'storyboard' },
    
    // General fixes
    { pattern: /\bi\s+mean\b/gi, replacement: 'I mean' },
    { pattern: /\bi\s+think\b/gi, replacement: 'I think' },
    { pattern: /\bim\b/g, replacement: "I'm" },
    { pattern: /\bdont\b/g, replacement: "don't" },
    { pattern: /\bwont\b/g, replacement: "won't" },
    { pattern: /\bcant\b/g, replacement: "can't" },
    { pattern: /\bisnt\b/g, replacement: "isn't" },
    { pattern: /\bdidnt\b/g, replacement: "didn't" },
    { pattern: /\bhavent\b/g, replacement: "haven't" },
    { pattern: /\bhasnt\b/g, replacement: "hasn't" },
    { pattern: /\bwouldnt\b/g, replacement: "wouldn't" },
    { pattern: /\bcouldnt\b/g, replacement: "couldn't" },
    { pattern: /\bshouldnt\b/g, replacement: "shouldn't" },
  ];
  
  for (const correction of corrections) {
    corrected = corrected.replace(correction.pattern, correction.replacement);
  }
  
  // Clean up multiple spaces
  corrected = corrected.replace(/\s+/g, ' ').trim();
  
  return corrected;
}

module.exports = {
  analyzeAudioQuality,
  detectMimeType,
  preprocessAudio,
  calculateConfidence,
  validateAudio,
  applyCorrections,
  AUDIO_CONFIG
};
