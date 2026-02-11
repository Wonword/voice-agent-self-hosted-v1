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
  const mimeType = detectMimeType(buffer);
  
  // Map MIME types to appropriate file extensions for ffmpeg
  const extensionMap = {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac'
  };
  
  const inputExt = extensionMap[mimeType] || 'bin';
  const inputFile = path.join(tempDir, `input_${timestamp}.${inputExt}`);
  const outputFile = path.join(tempDir, `output_${timestamp}.wav`);
  
  console.log(`[AudioProcessor] Detected MIME type: ${mimeType}, using extension: .${inputExt}`);
  
  try {
    // Write input buffer to temp file with correct extension
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
 * Enhanced for ESMOD Creative Tech and fashion terminology
 * @param {string} text - Raw transcription
 * @returns {string} Corrected text
 */
function applyCorrections(text) {
  if (!text || typeof text !== 'string') return text;
  
  let corrected = text;
  
  // Common homophone and speech recognition corrections
  const corrections = [
    // AI/Creative Tech terms - high priority
    { pattern: /\beye\s+(tools?|for|in|to|and)\b/gi, replacement: 'AI $1' },
    { pattern: /\ba\s+i\s+/gi, replacement: 'AI ' },
    { pattern: /\bay\s+i\s+/gi, replacement: 'AI ' },
    { pattern: /\baey\s+i\s+/gi, replacement: 'AI ' },
    { pattern: /\bhey\s+i\s+/gi, replacement: 'AI ' },
    { pattern: /\bartificial\s+intelligence\b/gi, replacement: 'AI' },
    
    // ESMOD specific
    { pattern: /\besmod\b/gi, replacement: 'ESMOD' },
    { pattern: /\bezmod\b/gi, replacement: 'ESMOD' },
    { pattern: /\bes\s+mod\b/gi, replacement: 'ESMOD' },
    { pattern: /\bes\s+mode\b/gi, replacement: 'ESMOD' },
    
    // RODE Framework
    { pattern: /\brode\s+framework\b/gi, replacement: 'RODE framework' },
    { pattern: /\broad\s+framework\b/gi, replacement: 'RODE framework' },
    { pattern: /\brode\b(?=.*\bframework\b)/gi, replacement: 'RODE' },
    { pattern: /\brode\b(?=.*\b(role|objective|details|examples)\b)/gi, replacement: 'RODE' },
    
    // Course/Branding terms
    { pattern: /\bcreative\s+tech\b/gi, replacement: 'Creative Tech' },
    { pattern: /\bcreative\s+technology\b/gi, replacement: 'Creative Technology' },
    { pattern: /\bbrand\s+challenge\b/gi, replacement: 'Brand Challenge' },
    { pattern: /\bera\s+bending\b/gi, replacement: 'Era Bending' },
    { pattern: /\bmix\s+board\b/gi, replacement: 'Mix Board' },
    { pattern: /\bmini\s+exercise\b/gi, replacement: 'Mini Exercise' },
    
    // Common AI tools
    { pattern: /\bchat\s*gpt\b/gi, replacement: 'ChatGPT' },
    { pattern: /\bchat\s+gpt\b/gi, replacement: 'ChatGPT' },
    { pattern: /\bchad\s+gpt\b/gi, replacement: 'ChatGPT' },
    { pattern: /\bmid\s*journey\b/gi, replacement: 'Midjourney' },
    { pattern: /\bmidjourney\b/gi, replacement: 'Midjourney' },
    { pattern: /\bstable\s*diffusion\b/gi, replacement: 'Stable Diffusion' },
    { pattern: /\bdall\s*e\b/gi, replacement: 'DALL-E' },
    { pattern: /\bclaude\b/gi, replacement: 'Claude' },
    { pattern: /\bperplexity\b/gi, replacement: 'Perplexity' },
    { pattern: /\bleonardo\.?ai\b/gi, replacement: 'Leonardo.ai' },
    { pattern: /\bphoto\s*shop\b/gi, replacement: 'Photoshop' },
    { pattern: /\bjava\s+script\b/gi, replacement: 'JavaScript' },
    { pattern: /\btype\s+script\b/gi, replacement: 'TypeScript' },
    { pattern: /\bnode\s*js\b/gi, replacement: 'Node.js' },
    { pattern: /\breact\s*js\b/gi, replacement: 'React' },
    { pattern: /\bnext\s*js\b/gi, replacement: 'Next.js' },
    
    // Fashion industry terms
    { pattern: /\bhaute\s+couture\b/gi, replacement: 'haute couture' },
    { pattern: /\bpr[êe]t[\s-][aà]\s*porter\b/gi, replacement: 'prêt-à-porter' },
    { pattern: /\bready\s+to\s+wear\b/gi, replacement: 'ready-to-wear' },
    { pattern: /\bcapsule\s+collection\b/gi, replacement: 'capsule collection' },
    { pattern: /\bdiffusion\s+line\b/gi, replacement: 'diffusion line' },
    { pattern: /\blook\s*book\b/gi, replacement: 'lookbook' },
    { pattern: /\bmood\s*board\b/gi, replacement: 'moodboard' },
    { pattern: /\bstory\s*board\b/gi, replacement: 'storyboard' },
    { pattern: /\bfabric\s+board\b/gi, replacement: 'fabric board' },
    { pattern: /\bcolor\s+palette\b/gi, replacement: 'color palette' },
    { pattern: /\brunway\b/gi, replacement: 'runway' },
    { pattern: /\bcatwalk\b/gi, replacement: 'catwalk' },
    { pattern: /\bgarment\b/gi, replacement: 'garment' },
    { pattern: /\bsilhouette\b/gi, replacement: 'silhouette' },
    { pattern: /\btextile\b/gi, replacement: 'textile' },
    { pattern: /\bfabric\b/gi, replacement: 'fabric' },
    { pattern: /\bpattern\s+making\b/gi, replacement: 'pattern making' },
    { pattern: /\batelier\b/gi, replacement: 'atelier' },
    { pattern: /\bfashion\s+house\b/gi, replacement: 'fashion house' },
    { pattern: /\bdesigner\s+label\b/gi, replacement: 'designer label' },
    { pattern: /\bluxury\s+brand\b/gi, replacement: 'luxury brand' },
    { pattern: /\bfashion\s+week\b/gi, replacement: 'Fashion Week' },
    
    // Creative process terms
    { pattern: /\bbrain\s*storm\b/gi, replacement: 'brainstorm' },
    { pattern: /\bbrain\s+storming\b/gi, replacement: 'brainstorming' },
    { pattern: /\bideation\b/gi, replacement: 'ideation' },
    { pattern: /\bconcept\s+development\b/gi, replacement: 'concept development' },
    { pattern: /\brapid\s+prototyping\b/gi, replacement: 'rapid prototyping' },
    { pattern: /\biterative\s+design\b/gi, replacement: 'iterative design' },
    { pattern: /\bdesign\s+thinking\b/gi, replacement: 'design thinking' },
    { pattern: /\buser\s+experience\b/gi, replacement: 'user experience' },
    { pattern: /\buser\s+interface\b/gi, replacement: 'user interface' },
    
    // Rubric/Grading terms
    { pattern: /\bgrading\s+rubric\b/gi, replacement: 'grading rubric' },
    { pattern: /\bassessment\s+criteria\b/gi, replacement: 'assessment criteria' },
    { pattern: /\bten\s+points\b/gi, replacement: '10 points' },
    { pattern: /\bten\s*\/\s*10\b/gi, replacement: '10/10' },
    
    // Common contractions and speech artifacts
    { pattern: /\bi\s+mean\b/gi, replacement: 'I mean' },
    { pattern: /\bi\s+think\b/gi, replacement: 'I think' },
    { pattern: /\bi\s+guess\b/gi, replacement: 'I guess' },
    { pattern: /\bi\s+suppose\b/gi, replacement: 'I suppose' },
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
    { pattern: /\bthats\b/g, replacement: "that's" },
    { pattern: /\btheres\b/g, replacement: "there's" },
    { pattern: /\bheres\b/g, replacement: "here's" },
    { pattern: /\bwhats\b/g, replacement: "what's" },
    { pattern: /\bwheres\b/g, replacement: "where's" },
    { pattern: /\bhows\b/g, replacement: "how's" },
    { pattern: /\bits\b(?=\s+(?:a|an|the|not))/g, replacement: "it's" },
    { pattern: /\byoure\b/g, replacement: "you're" },
    { pattern: /\bwere\b(?=\s+(?:going|planning|working))/g, replacement: "we're" },
    { pattern: /\btheyre\b/g, replacement: "they're" },
    { pattern: /\bill\b/g, replacement: "I'll" },
    { pattern: /\byoul\b/g, replacement: "you'll" },
    { pattern: /\bhell\b/g, replacement: "he'll" },
    { pattern: /\bshell\b/g, replacement: "she'll" },
    { pattern: /\bwell\b(?=\s+(?:see|try|do|have))/g, replacement: "we'll" },
    { pattern: /\bdont\b/g, replacement: "don't" },
    { pattern: /\bwont\b/g, replacement: "won't" },
    
    // Common misheard words/phrases
    { pattern: /\buhm\b/gi, replacement: 'um' },
    { pattern: /\bahm\b/gi, replacement: 'um' },
    { pattern: /\buh\b/gi, replacement: '' },
    { pattern: /\blike\s+like\b/gi, replacement: 'like' },
    { pattern: /\byou\s+know\s+what\s+i\s+mean\b/gi, replacement: '' },
    { pattern: /\bi\s+mean,?\s+like\b/gi, replacement: '' },
    { pattern: /\bsort\s+of\b/gi, replacement: '' },
    { pattern: /\bkind\s+of\b/gi, replacement: '' },
    
    // Punctuation fixes
    { pattern: /\s+,/g, replacement: ',' },
    { pattern: /\s+\./g, replacement: '.' },
    { pattern: /\s+\?/g, replacement: '?' },
    { pattern: /\s+!/g, replacement: '!' },
    { pattern: /\.\s*\.\s*\./g, replacement: '...' },
  ];
  
  for (const correction of corrections) {
    corrected = corrected.replace(correction.pattern, correction.replacement);
  }
  
  // Clean up multiple spaces and trim
  corrected = corrected.replace(/\s+/g, ' ').trim();
  
  // Remove leading/trailing punctuation artifacts
  corrected = corrected.replace(/^[,.\s]+|[,.\s]+$/g, '');
  
  return corrected;
}

module.exports = {
  analyzeAudioQuality,
  detectMimeType,
  preprocessAudio,
  preprocessAudioQuick,
  calculateConfidence,
  validateAudio,
  applyCorrections,
  isFfmpegAvailable,
  FFMPEG_AVAILABLE,
  AUDIO_CONFIG
};
