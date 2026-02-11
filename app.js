/**
 * Voice Agent for Creative Tech - Main Application
 * Handles voice chat with real API integration, dashboard, history, and settings
 */

// API Configuration
const API_BASE_URL = '';

// App State
const AppState = {
    currentView: 'chat',
    micPermission: null,
    isListening: false,
    isProcessing: false,
    messages: [],
    audioContext: null,
    analyser: null,
    mediaRecorder: null,
    recordedChunks: [],
    preInitializedStream: null,
    stats: {
        totalQueries: 0,
        voiceQueries: 0,
        dailyQueries: [0, 0, 0, 0, 0, 0, 0]
    },
    settings: {
        ttsEnabled: true,
        autoSend: true
    }
};

// DOM Elements
const elements = {};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    initializeApp();
    bindEvents();
    checkMicrophonePermission();
    loadInitialStats();
    initCanvasVisualizer();
    
    // Pre-initialize microphone to reduce delay
    preInitializeMicrophone();
});

function cacheElements() {
    // Navigation
    elements.navChat = document.getElementById('navChat');
    elements.navDashboard = document.getElementById('navDashboard');
    elements.navHistory = document.getElementById('navHistory');
    elements.navSettings = document.getElementById('navSettings');
    
    // Views
    elements.chatView = document.getElementById('chatView');
    elements.dashboardView = document.getElementById('dashboardView');
    elements.historyView = document.getElementById('historyView');
    elements.settingsView = document.getElementById('settingsView');
    
    // Mic and Audio
    elements.micButton = document.getElementById('micButton');
    elements.micIcon = document.getElementById('micIcon');
    elements.stopIcon = document.getElementById('stopIcon');
    elements.micStatus = document.getElementById('micStatus');
    elements.voiceVisualizer = document.getElementById('voiceVisualizer');
    
    // Text Input
    elements.textInput = document.getElementById('textInput');
    elements.sendBtn = document.getElementById('sendBtn');
    
    // Messages
    elements.conversationArea = document.getElementById('conversationArea');
    elements.welcomeMessage = document.getElementById('welcomeMessage');
    
    // Dashboard
    elements.totalQueries = document.getElementById('totalQueries');
    elements.voiceCount = document.getElementById('voiceCount');
    elements.costSaved = document.getElementById('costSaved');
    elements.avgResponse = document.getElementById('avgResponse');
    elements.cacheHits = document.getElementById('cacheHits');
    
    // History
    elements.historyList = document.getElementById('historyList');
    elements.historySearch = document.getElementById('historySearch');
    
    // Settings
    elements.ttsToggle = document.getElementById('ttsToggle');
    elements.voiceSelector = document.getElementById('voiceSelector');
}

// Canvas Visualizer Setup
let visualizerCtx = null;
let visualizerCanvas = null;
let animationId = null;

function initCanvasVisualizer() {
    visualizerCanvas = document.getElementById('voiceVisualizer');
    if (!visualizerCanvas) return;
    
    visualizerCtx = visualizerCanvas.getContext('2d');
    
    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = visualizerCanvas.getBoundingClientRect();
    visualizerCanvas.width = rect.width * dpr;
    visualizerCanvas.height = rect.height * dpr;
    visualizerCtx.scale(dpr, dpr);
    
    // Initial draw - idle state
    drawIdleVisualizer();
}

function drawIdleVisualizer() {
    if (!visualizerCtx || !visualizerCanvas) return;
    
    const width = visualizerCanvas.width / (window.devicePixelRatio || 1);
    const height = visualizerCanvas.height / (window.devicePixelRatio || 1);
    const barCount = 24;
    const barWidth = (width / barCount) - 2;
    
    visualizerCtx.clearRect(0, 0, width, height);
    
    // Draw subtle idle bars with gentle wave animation
    const time = Date.now() / 1000;
    
    for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + 2) + 1;
        // Gentle sine wave for idle animation
        const wave = Math.sin(time * 2 + i * 0.3) * 0.3 + 0.5;
        const barHeight = 4 + wave * 8;
        const y = height - barHeight;
        
        const gradient = visualizerCtx.createLinearGradient(0, height, 0, y);
        gradient.addColorStop(0, '#0ea5e9');
        gradient.addColorStop(1, '#8b5cf6');
        
        visualizerCtx.fillStyle = gradient;
        visualizerCtx.beginPath();
        visualizerCtx.roundRect(x, y, barWidth, barHeight, 2);
        visualizerCtx.fill();
    }
    
    if (!AppState.isListening && !AppState.isProcessing) {
        animationId = requestAnimationFrame(drawIdleVisualizer);
    }
}

function startRealVisualizer(stream) {
    if (!visualizerCtx || !visualizerCanvas) return;
    
    // Cancel idle animation
    if (animationId) cancelAnimationFrame(animationId);
    
    // Setup Web Audio API
    AppState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    AppState.analyser = AppState.audioContext.createAnalyser();
    AppState.analyser.fftSize = 64;
    AppState.analyser.smoothingTimeConstant = 0.8;
    
    const source = AppState.audioContext.createMediaStreamSource(stream);
    source.connect(AppState.analyser);
    
    const bufferLength = AppState.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const width = visualizerCanvas.width / (window.devicePixelRatio || 1);
    const height = visualizerCanvas.height / (window.devicePixelRatio || 1);
    const barCount = 24;
    const barWidth = (width / barCount) - 2;
    
    function draw() {
        if (!AppState.isListening) {
            drawIdleVisualizer();
            return;
        }
        
        animationId = requestAnimationFrame(draw);
        AppState.analyser.getByteFrequencyData(dataArray);
        
        visualizerCtx.clearRect(0, 0, width, height);
        
        // Draw bars based on frequency data
        for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor(i * (bufferLength / barCount));
            const value = dataArray[dataIndex] || 0;
            
            // Scale the value (0-255) to bar height
            const normalizedValue = value / 255;
            const barHeight = 4 + (normalizedValue * (height - 8));
            const x = i * (barWidth + 2) + 1;
            const y = height - barHeight;
            
            // Dynamic gradient based on intensity
            const gradient = visualizerCtx.createLinearGradient(0, height, 0, y);
            if (normalizedValue > 0.7) {
                gradient.addColorStop(0, '#ef4444');
                gradient.addColorStop(1, '#f97316');
            } else if (normalizedValue > 0.4) {
                gradient.addColorStop(0, '#0ea5e9');
                gradient.addColorStop(1, '#8b5cf6');
            } else {
                gradient.addColorStop(0, '#0ea5e9');
                gradient.addColorStop(1, '#06b6d4');
            }
            
            visualizerCtx.fillStyle = gradient;
            visualizerCtx.beginPath();
            visualizerCtx.roundRect(x, y, barWidth, barHeight, 2);
            visualizerCtx.fill();
        }
    }
    
    draw();
}

function initializeApp() {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('voiceAgentSettings');
    if (savedSettings) {
        AppState.settings = { ...AppState.settings, ...JSON.parse(savedSettings) };
        if (elements.ttsToggle) elements.ttsToggle.checked = AppState.settings.ttsEnabled;
    }
    
    // Load history
    loadHistory();
}

function bindEvents() {
    // Navigation
    elements.navChat?.addEventListener('click', () => switchView('chat'));
    elements.navDashboard?.addEventListener('click', () => switchView('dashboard'));
    elements.navHistory?.addEventListener('click', () => switchView('history'));
    elements.navSettings?.addEventListener('click', () => switchView('settings'));
    
    // Mic button events
    elements.micButton?.addEventListener('mousedown', startListening);
    elements.micButton?.addEventListener('touchstart', handleTouchStart, { passive: false });
    elements.micButton?.addEventListener('mouseup', stopListening);
    elements.micButton?.addEventListener('touchend', handleTouchEnd, { passive: false });
    elements.micButton?.addEventListener('mouseleave', stopListening);
    elements.micButton?.addEventListener('contextmenu', e => e.preventDefault());
    
    // Text input
    elements.sendBtn?.addEventListener('click', sendTextMessage);
    elements.textInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendTextMessage();
    });
    
    // Settings
    elements.ttsToggle?.addEventListener('change', (e) => {
        AppState.settings.ttsEnabled = e.target.checked;
        localStorage.setItem('voiceAgentSettings', JSON.stringify(AppState.settings));
        showToast(`Text-to-Speech ${e.target.checked ? 'enabled' : 'disabled'}`);
    });
    
    // Voice selector
    elements.voiceSelector?.addEventListener('change', (e) => {
        const voiceIndex = parseInt(e.target.value);
        if (!isNaN(voiceIndex) && cachedVoices[voiceIndex]) {
            selectedVoice = cachedVoices[voiceIndex];
            console.log('User selected voice:', selectedVoice.name);
            showToast(`Voice set to: ${selectedVoice.name}`);
            
            // Test the voice
            const testUtterance = new SpeechSynthesisUtterance("This is the new voice.");
            testUtterance.voice = selectedVoice;
            testUtterance.pitch = selectedVoice.name.toLowerCase().includes('female') ? 0.8 : 0.95;
            window.speechSynthesis.speak(testUtterance);
        } else {
            selectedVoice = null;
            showToast('Using auto voice selection');
        }
    });
    
    // Populate voice selector when voices are loaded
    if (window.speechSynthesis) {
        const populateVoiceSelector = () => {
            if (!elements.voiceSelector) return;
            
            const voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) return;
            
            // Clear existing options except first
            while (elements.voiceSelector.options.length > 1) {
                elements.voiceSelector.remove(1);
            }
            
            // Add all voices
            voices.forEach((voice, index) => {
                const option = document.createElement('option');
                option.value = index;
                const isMale = !voice.name.toLowerCase().includes('female') && 
                              !voice.name.toLowerCase().includes('zira') &&
                              !voice.name.toLowerCase().includes('samantha');
                option.textContent = `${voice.name} (${voice.lang}) ${isMale ? '👨' : '👩'}`;
                elements.voiceSelector.appendChild(option);
            });
            
            console.log('Voice selector populated with', voices.length, 'voices');
        };
        
        // Try to populate immediately
        populateVoiceSelector();
        
        // And when voices change
        window.speechSynthesis.onvoiceschanged = () => {
            refreshVoices();
            populateVoiceSelector();
        };
    }
    
    // Mobile nav buttons
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view) switchView(view);
        });
    });
    
    // History search
    elements.historySearch?.addEventListener('input', (e) => filterHistory(e.target.value));
    
    // Clear history
    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
        if (confirm('Clear all history?')) {
            localStorage.removeItem('voiceAgentHistory');
            renderHistory([]);
            showToast('History cleared');
        }
    });
    
    // Permission modal
    document.getElementById('requestPermissionBtn')?.addEventListener('click', async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            document.getElementById('permissionModal')?.classList.add('hidden');
            AppState.micPermission = 'granted';
            updateMicPermissionStatus('Granted', 'green');
            showToast('Microphone access granted!');
        } catch (err) {
            showToast('Microphone access denied', 'error');
            updateMicPermissionStatus('Denied', 'red');
        }
    });
    
    document.getElementById('dismissPermissionBtn')?.addEventListener('click', () => {
        document.getElementById('permissionModal')?.classList.add('hidden');
    });
    
    // Reset permissions
    document.getElementById('resetPermissions')?.addEventListener('click', () => {
        document.getElementById('permissionModal')?.classList.remove('hidden');
    });
    
    // Space bar shortcut
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !AppState.isListening && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            startListening();
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && AppState.isListening) {
            e.preventDefault();
            stopListening();
        }
    });
}

// View Navigation
function switchView(viewName) {
    AppState.currentView = viewName;
    
    // Hide all views (remove active-view, add hidden-view)
    [elements.chatView, elements.dashboardView, elements.historyView, elements.settingsView].forEach(view => {
        if (view) {
            view.classList.remove('active-view');
            view.classList.add('hidden-view');
        }
    });
    
    // Show selected view
    const viewMap = {
        chat: elements.chatView,
        dashboard: elements.dashboardView,
        history: elements.historyView,
        settings: elements.settingsView
    };
    
    if (viewMap[viewName]) {
        viewMap[viewName].classList.remove('hidden-view');
        viewMap[viewName].classList.add('active-view');
    }
    
    // Update nav active states
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.classList.remove('text-primary-400', 'active');
        btn.classList.add('text-gray-400');
        if (btn.dataset.view === viewName) {
            btn.classList.remove('text-gray-400');
            btn.classList.add('text-primary-400', 'active');
        }
    });
}

// Microphone Permission
async function checkMicrophonePermission() {
    try {
        // Check if Chrome for specific instructions
        const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
        if (isChrome) {
            document.getElementById('chromeInstructions')?.classList.remove('hidden');
        }
        
        if (navigator.permissions && navigator.permissions.query) {
            const result = await navigator.permissions.query({ name: 'microphone' });
            AppState.micPermission = result.state;
            
            if (result.state === 'prompt') {
                document.getElementById('permissionModal')?.classList.remove('hidden');
            }
            
            updateMicPermissionStatus(result.state === 'granted' ? 'Granted' : result.state === 'denied' ? 'Denied' : 'Prompt', 
                result.state === 'granted' ? 'green' : result.state === 'denied' ? 'red' : 'yellow');
            
            result.addEventListener('change', () => {
                AppState.micPermission = result.state;
                updateMicPermissionStatus(result.state === 'granted' ? 'Granted' : result.state === 'denied' ? 'Denied' : 'Prompt',
                    result.state === 'granted' ? 'green' : result.state === 'denied' ? 'red' : 'yellow');
            });
        } else {
            updateMicPermissionStatus('Unknown', 'gray');
        }
    } catch (error) {
        console.log('Permission API not supported');
        updateMicPermissionStatus('Unknown', 'gray');
    }
}

function updateMicPermissionStatus(text, color) {
    const el = document.getElementById('micPermissionStatus');
    if (el) {
        const colorClass = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : color === 'yellow' ? 'text-yellow-400' : 'text-gray-400';
        el.innerHTML = `<span class="${colorClass}">●</span> ${text}`;
    }
}

// Voice Handling
function handleTouchStart(e) {
    e.preventDefault();
    startListening();
}

function handleTouchEnd(e) {
    e.preventDefault();
    stopListening();
}

async function startListening() {
    if (AppState.isListening || AppState.isProcessing) return;
    
    try {
        // Show listening state immediately before requesting mic
        elements.micButton?.classList.remove('idle');
        elements.micButton?.classList.add('listening');
        elements.micIcon?.classList.add('hidden');
        elements.stopIcon?.classList.remove('hidden');
        if (elements.micStatus) elements.micStatus.textContent = 'Listening...';
        
        // Use pre-initialized stream if available for zero-delay start
        let stream;
        if (AppState.preInitializedStream) {
            stream = AppState.preInitializedStream;
            // Get a fresh stream for next time
            AppState.preInitializedStream = null;
            preInitializeMicrophone();
        } else {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        
        AppState.isListening = true;
        AppState.recordedChunks = [];
        
        // Setup MediaRecorder for audio capture
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        AppState.mediaRecorder = new MediaRecorder(stream, { mimeType });
        
        AppState.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) AppState.recordedChunks.push(e.data);
        };
        
        // Start recording immediately - no timeslice to capture from the very beginning
        AppState.mediaRecorder.start();
        
        // Start visualizer
        startRealVisualizer(stream);
        
    } catch (error) {
        console.error('Microphone access error:', error);
        showToast('Microphone access denied. Please enable it in settings.', 'error');
        // Reset UI on error
        elements.micButton?.classList.remove('listening');
        elements.micButton?.classList.add('idle');
        elements.micIcon?.classList.remove('hidden');
        elements.stopIcon?.classList.add('hidden');
        if (elements.micStatus) elements.micStatus.textContent = 'Hold to speak';
    }
}

async function stopListening() {
    if (!AppState.isListening) return;
    
    AppState.isListening = false;
    
    // Stop recording
    if (AppState.mediaRecorder && AppState.mediaRecorder.state !== 'inactive') {
        AppState.mediaRecorder.stop();
        AppState.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    // Stop audio context
    if (AppState.audioContext) {
        AppState.audioContext.close();
        AppState.audioContext = null;
    }
    
    // Update UI
    elements.micButton?.classList.remove('listening');
    elements.micButton?.classList.add('processing');
    elements.micIcon?.classList.remove('hidden');
    elements.stopIcon?.classList.add('hidden');
    if (elements.micStatus) elements.micStatus.textContent = 'Processing...';
    
    AppState.isProcessing = true;
    
    // Process recorded audio
    setTimeout(async () => {
        if (AppState.recordedChunks.length > 0) {
            const audioBlob = new Blob(AppState.recordedChunks, { type: 'audio/webm' });
            await processVoiceQuery(audioBlob);
        }
        
        AppState.isProcessing = false;
        elements.micButton?.classList.remove('processing');
        elements.micButton?.classList.add('idle');
        if (elements.micStatus) elements.micStatus.textContent = 'Hold to speak';
    }, 500);
}

async function processVoiceQuery(audioBlob) {
    try {
        showToast('Transcribing voice...', 'info');
        
        // 1. Transcribe audio
        const transcribeRes = await fetch(`${API_BASE_URL}/transcribe`, {
            method: 'POST',
            body: audioBlob
        });
        
        if (!transcribeRes.ok) throw new Error('Transcription failed');
        
        const transcribeData = await transcribeRes.json();
        const transcript = transcribeData.transcript;
        
        if (!transcript || transcript.trim() === '') {
            showToast('No speech detected. Try again.', 'error');
            return;
        }
        
        // Add user message
        addMessage(transcript, 'user');
        
        // 2. Get AI response
        showToast('Getting response...', 'info');
        await getAIResponse(transcript, true);
        
    } catch (error) {
        console.error('Voice processing error:', error);
        showToast('Error processing voice. Try typing instead.', 'error');
    }
}

// Text Input Handling
async function sendTextMessage() {
    const text = elements.textInput?.value.trim();
    if (!text) return;
    
    // Clear input
    elements.textInput.value = '';
    
    // Hide welcome message
    if (elements.welcomeMessage) elements.welcomeMessage.style.display = 'none';
    
    // Add user message
    addMessage(text, 'user');
    
    // Get AI response
    await getAIResponse(text, false);
}

async function getAIResponse(message, isVoice) {
    try {
        const res = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        
        if (!res.ok) throw new Error('Chat failed');
        
        const data = await res.json();
        const response = data.response;
        
        // Add AI message
        addMessage(response, 'assistant');
        
        // Speak response if TTS enabled and voice query
        if (isVoice && AppState.settings.ttsEnabled) {
            speakText(response);
        }
        
        // Update stats
        AppState.stats.totalQueries++;
        if (isVoice) AppState.stats.voiceQueries++;
        updateStats();
        addToHistory(message, response);
        
    } catch (error) {
        console.error('Chat error:', error);
        addMessage('I apologize, I could not connect to the server. Please try again.', 'assistant');
    }
}

function speakText(text) {
    if (!window.speechSynthesis) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    
    // Use user-selected voice or find best male voice
    let voice = selectedVoice || getBestMaleVoice();
    
    if (voice) {
        utterance.voice = voice;
        // Lower pitch if voice name suggests female
        const isFemale = voice.name.toLowerCase().includes('female') || 
                        voice.name.toLowerCase().includes('woman') ||
                        voice.name.toLowerCase().includes('zira') ||
                        voice.name.toLowerCase().includes('samantha');
        utterance.pitch = isFemale ? 0.8 : 0.95;
        console.log('Using voice:', voice.name, voice.lang, 'pitch:', utterance.pitch);
    } else {
        // No voice available yet - wait and retry
        console.log('Voices not loaded yet, waiting...');
        setTimeout(() => speakText(text), 500);
        return;
    }
    
    window.speechSynthesis.speak(utterance);
}

// Ensure voices are loaded - mobile browsers load voices asynchronously
let cachedVoices = [];
let selectedVoice = null; // User-selected voice preference

function refreshVoices() {
    cachedVoices = window.speechSynthesis.getVoices();
    console.log('Available voices:', cachedVoices.map(v => `${v.name} (${v.lang})`).join(', '));
    
    // Log all voice names for debugging
    console.log('All available voices:');
    cachedVoices.forEach((v, i) => {
        console.log(`${i}: ${v.name} (${v.lang}) - ${v.default ? 'DEFAULT' : ''}`);
    });
    
    return cachedVoices;
}

function getBestMaleVoice() {
    const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
    
    if (!voices || voices.length === 0) {
        console.log('No voices available yet');
        return null;
    }
    
    // Priority order for male voices
    const maleVoicePatterns = [
        { name: 'Daniel', priority: 1 },
        { name: 'Google UK English Male', priority: 2 },
        { name: 'Microsoft David', priority: 3 },
        { name: 'Microsoft James', priority: 4 },
        { name: 'Microsoft George', priority: 5 },
        { name: 'Fred', priority: 6 },
        { name: 'Alex', priority: 7 },
        { name: 'Tom', priority: 8 },
        { name: 'Arthur', priority: 9 },
        { name: 'Google US English Male', priority: 10 },
    ];
    
    // Try exact matches first
    for (const pattern of maleVoicePatterns) {
        const match = voices.find(v => v.name === pattern.name);
        if (match) {
            console.log('Found exact match male voice:', match.name);
            return match;
        }
    }
    
    // Try partial matches
    const partialPatterns = [
        v => v.name.toLowerCase().includes('daniel'),
        v => v.name.toLowerCase().includes('uk english male'),
        v => v.name.toLowerCase().includes('british male'),
        v => v.name.toLowerCase().includes('english male') && !v.name.toLowerCase().includes('female'),
        v => v.lang === 'en-GB' && !v.name.toLowerCase().includes('female'),
        v => v.lang === 'en-GB',
    ];
    
    for (const pattern of partialPatterns) {
        const match = voices.find(pattern);
        if (match) {
            console.log('Found partial match male voice:', match.name);
            return match;
        }
    }
    
    // Fallback: pick any non-female English voice
    const nonFemale = voices.find(v => 
        v.lang.startsWith('en') && 
        !v.name.toLowerCase().includes('female') &&
        !v.name.toLowerCase().includes('woman') &&
        !v.name.toLowerCase().includes('girl') &&
        !v.name.toLowerCase().includes('zira') &&
        !v.name.toLowerCase().includes('samantha')
    );
    
    if (nonFemale) {
        console.log('Found non-female voice:', nonFemale.name);
        return nonFemale;
    }
    
    console.log('No male voice found, returning first English voice');
    return voices.find(v => v.lang.startsWith('en')) || voices[0];
}

if (window.speechSynthesis) {
    // Initial load
    refreshVoices();
    
    // Mobile browsers fire this when voices are available
    window.speechSynthesis.onvoiceschanged = () => {
        refreshVoices();
    };
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'animate-fade-in';
    
    const isUser = sender === 'user';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (isUser) {
        messageDiv.innerHTML = `
            <div class="flex justify-end mb-3">
                <div class="message-user rounded-2xl rounded-tr-none p-3 max-w-[85%]">
                    <p class="text-white text-sm">${escapeHtml(text)}</p>
                    <span class="text-xs text-blue-200/70 mt-1 block text-right">${time}</span>
                </div>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="message-bot rounded-2xl p-3 mb-3">
                <div class="flex gap-2">
                    <div class="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 border border-dark-600">
                        <img src="Obiwon-portrait-wise.jpeg" alt="Obiwon" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='🧙‍♂️'">
                    </div>
                    <div class="flex-1">
                        <p class="text-gray-300 leading-relaxed text-sm">${escapeHtml(text)}</p>
                        <span class="text-xs text-gray-500 mt-1 block">${time}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Insert at the top (newest first)
    elements.conversationArea?.insertBefore(messageDiv, elements.conversationArea.firstChild);
    
    // Save to state
    AppState.messages.push({ text, sender, timestamp: Date.now() });
}

// Dashboard & Stats
function loadInitialStats() {
    // Load from localStorage or use defaults
    const savedStats = localStorage.getItem('voiceAgentStats');
    if (savedStats) {
        AppState.stats = JSON.parse(savedStats);
    }
    updateStats();
    generateChart();
}

function updateStats() {
    if (elements.totalQueries) elements.totalQueries.textContent = AppState.stats.totalQueries;
    if (elements.voiceCount) elements.voiceCount.textContent = AppState.stats.voiceQueries;
    if (elements.costSaved) elements.costSaved.textContent = `$${(AppState.stats.totalQueries * 0.005).toFixed(2)}`;
    if (elements.cacheHits) elements.cacheHits.textContent = Math.floor(AppState.stats.totalQueries * 0.3);
    
    // Save to localStorage
    localStorage.setItem('voiceAgentStats', JSON.stringify(AppState.stats));
}

function generateChart() {
    const chartEl = document.getElementById('weeklyChart');
    const labelsEl = document.getElementById('chartLabels');
    if (!chartEl) return;
    
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = AppState.stats.dailyQueries;
    const max = Math.max(...data, 1);
    
    chartEl.innerHTML = days.map((day, i) => {
        const height = (data[i] / max) * 100;
        return `
            <div class="flex-1 bg-dark-700 rounded-t-md relative" style="height: 100%;">
                <div class="chart-bar absolute bottom-0 w-full bg-primary-500 rounded-t-md" style="height: ${Math.max(height, 5)}%"></div>
            </div>
        `;
    }).join('');
    
    if (labelsEl) {
        labelsEl.innerHTML = days.map(day => `<span>${day}</span>`).join('');
    }
}

// History
function loadHistory() {
    const saved = localStorage.getItem('voiceAgentHistory');
    if (saved) {
        const history = JSON.parse(saved);
        renderHistory(history);
    }
}

function renderHistory(items) {
    if (!elements.historyList) return;
    
    if (items.length === 0) {
        elements.historyList.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <p>No history yet</p>
            </div>
        `;
        return;
    }
    
    elements.historyList.innerHTML = items.slice().reverse().map(item => {
        const time = formatTimeAgo(item.timestamp);
        return `
            <div class="bg-dark-800 rounded-xl p-3 border border-dark-700 mb-2">
                <div class="flex items-start justify-between mb-1">
                    <p class="font-medium text-white text-sm">${escapeHtml(item.query)}</p>
                    <span class="text-xs text-gray-500">${time}</span>
                </div>
                <p class="text-sm text-gray-400 line-clamp-2">${escapeHtml(item.response)}</p>
            </div>
        `;
    }).join('');
}

function addToHistory(query, response) {
    const saved = localStorage.getItem('voiceAgentHistory');
    const history = saved ? JSON.parse(saved) : [];
    
    history.push({ query, response, timestamp: Date.now() });
    
    // Keep only last 50 items
    if (history.length > 50) history.shift();
    
    localStorage.setItem('voiceAgentHistory', JSON.stringify(history));
    renderHistory(history);
    
    // Update daily stats
    const day = new Date().getDay();
    AppState.stats.dailyQueries[day === 0 ? 6 : day - 1]++;
    generateChart();
}

function filterHistory(searchTerm) {
    const saved = localStorage.getItem('voiceAgentHistory');
    if (!saved) return;
    
    const history = JSON.parse(saved);
    const filtered = history.filter(item => 
        item.query.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.response.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    renderHistory(filtered);
}

// Utilities
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = {
        info: 'bg-dark-800 border-primary-500/50 text-primary-400',
        success: 'bg-green-500/20 border-green-500/50 text-green-400',
        error: 'bg-red-500/20 border-red-500/50 text-red-400'
    };
    
    toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg border text-sm shadow-lg animate-slide-up z-50 ${colors[type]}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Pre-initialize microphone stream to reduce button-click delay
async function preInitializeMicrophone() {
    try {
        // Request mic permission early and keep stream ready
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        AppState.preInitializedStream = stream;
        AppState.micPermission = 'granted';
        console.log('Microphone pre-initialized');
    } catch (err) {
        console.log('Mic pre-initialization failed:', err.message);
    }
}

// Cleanup on page hide
document.addEventListener('visibilitychange', () => {
    if (document.hidden && AppState.isListening) {
        stopListening();
    }
});

// Handle resize
window.addEventListener('resize', () => {
    initCanvasVisualizer();
});
