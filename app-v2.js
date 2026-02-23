// ─── CONFIGURATION ──────────────────────────────────────────────
const API_BASE_URL = '';
const AppState = {
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    audioCtx: null,
    analyser: null,
    micStream: null,
    animId: null,
    settings: {
        ttsEnabled: true,
        autoSend: true
    }
};

// ─── INITIALIZATION ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initVisualizer();
    setupEventListeners();
    console.log("🧙‍♂️ Obiwon UI Initialized - Innovation Edition");
});

function initVisualizer() {
    const vizBars = document.getElementById('vizBars');
    if (!vizBars) return;

    vizBars.innerHTML = ''; // Clear previous bars
    const BAR_COUNT = 38;
    for (let i = 0; i < BAR_COUNT; i++) {
        const b = document.createElement('div');
        b.className = 'viz-bar';
        const delay = (i / BAR_COUNT) * 2;
        b.style.animation = `idlePulse 2.4s ${delay.toFixed(2)}s ease-in-out infinite`;
        vizBars.appendChild(b);
    }
}

function setupEventListeners() {
    const micBtn = document.getElementById('micButton');
    const sendBtn = document.getElementById('sendBtn');
    const textIn = document.getElementById('textInput');
    const chips = document.querySelectorAll('.chip');

    if (micBtn) micBtn.onclick = toggleRec;
    if (sendBtn) sendBtn.onclick = sendText;
    if (textIn) {
        textIn.onkeypress = (e) => {
            if (e.key === 'Enter') sendText();
        };
    }

    chips.forEach(chip => {
        chip.onclick = () => {
            const query = chip.getAttribute('data-ask');
            addMessage('user', query);
            ask(query);
        };
    });
}

// ─── CORE LOGIC ─────────────────────────────────────────────────

async function toggleRec() {
    const btn = document.getElementById('micButton');
    const icon = document.getElementById('micIcon');
    const status = document.getElementById('micStatus');

    if (AppState.isRecording) {
        stopRecording();
        btn.classList.remove('recording');
        if (status) status.innerText = '[ PROCESSING... ]';
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            startRecording(stream);
            btn.classList.add('recording');
            if (status) status.innerText = '[ TRANSMITTING... ]';
        } catch (err) {
            console.error("Mic/Recording initialization failed:", err);
            let errorMsg = "Microphone error: ";
            if (err.name === 'NotAllowedError') {
                errorMsg = "Microphone access blocked by browser settings.";
            } else if (err.name === 'NotFoundError') {
                errorMsg = "No microphone found on this device.";
            } else if (err.name === 'NotReadableError') {
                errorMsg = "Microphone is already in use by another application.";
            } else if (err instanceof TypeError && !navigator.mediaDevices) {
                errorMsg = "Browser environment does not support media devices (HTTP issue?).";
            } else {
                errorMsg += err.name + " - " + err.message;
            }
            alert(errorMsg);
        }
    }
}

function startRecording(stream) {
    AppState.micStream = stream;
    AppState.isRecording = true;
    AppState.audioChunks = [];

    // Audio context for visualizer
    AppState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = AppState.audioCtx.createMediaStreamSource(stream);
    AppState.analyser = AppState.audioCtx.createAnalyser();
    AppState.analyser.fftSize = 256;
    source.connect(AppState.analyser);

    // Media Recorder
    AppState.mediaRecorder = new MediaRecorder(stream);
    AppState.mediaRecorder.ondataavailable = (e) => {
        AppState.audioChunks.push(e.data);
    };
    AppState.mediaRecorder.onstop = processAudio;
    AppState.mediaRecorder.start();

    drawVisualizer();
}

function stopRecording() {
    if (AppState.mediaRecorder && AppState.mediaRecorder.state !== 'inactive') {
        AppState.mediaRecorder.stop();
    }
    if (AppState.micStream) {
        AppState.micStream.getTracks().forEach(t => t.stop());
    }
    if (AppState.audioCtx) {
        AppState.audioCtx.close();
        AppState.audioCtx = null;
    }
    AppState.isRecording = false;
    cancelAnimationFrame(AppState.animId);
}

function drawVisualizer() {
    if (!AppState.isRecording) return;
    AppState.animId = requestAnimationFrame(drawVisualizer);

    const dataArray = new Uint8Array(AppState.analyser.frequencyBinCount);
    AppState.analyser.getByteFrequencyData(dataArray);

    const bars = document.querySelectorAll('.viz-bar');
    bars.forEach((bar, i) => {
        const val = dataArray[i % dataArray.length];
        const height = Math.max(4, (val / 255) * 80);
        bar.style.height = height + 'px';
        bar.style.opacity = Math.max(0.3, val / 255);
        bar.style.animation = 'none';
    });
}

function resetVisualizer() {
    const bars = document.querySelectorAll('.viz-bar');
    bars.forEach((b, i) => {
        b.style.height = '4px';
        b.style.opacity = '0.5';
        const delay = (i / bars.length) * 2;
        b.style.animation = `idlePulse 2.4s ${delay.toFixed(2)}s ease-in-out infinite`;
    });
}

async function processAudio() {
    const blob = new Blob(AppState.audioChunks, { type: 'audio/webm' });
    const status = document.getElementById('micStatus');

    try {
        const response = await fetch(`${API_BASE_URL}/transcribe`, {
            method: 'POST',
            body: blob
        });
        const data = await response.json();

        if (data.transcript) {
            addMessage('user', data.transcript);
            ask(data.transcript);
        } else {
            if (status) status.innerText = '[ NO VOICE DETECTED ]';
            setTimeout(() => { if (status) status.innerText = '[ TAP MIC TO TRANSMIT ]'; }, 3000);
            resetVisualizer();
        }
    } catch (err) {
        console.error("Audio processing error:", err);
        if (status) status.innerText = '[ ERROR ]';
        resetVisualizer();
    }
}

async function ask(text) {
    if (!text) return;

    const typing = document.getElementById('typingInd');
    const welcome = document.getElementById('welcomeMessage');
    const status = document.getElementById('micStatus');

    if (welcome) welcome.style.display = 'none';
    if (typing) typing.classList.add('show');
    if (status) status.innerText = '[ OBIWON IS THINKING ]';

    try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await response.json();

        if (data.response) {
            if (status) status.innerText = '[ SYNTHESIZING VOICE... ]';
            await speakText(data.response);
        }

        if (typing) typing.classList.remove('show');
        if (status) status.innerText = '[ TAP MIC TO TRANSMIT ]';

        if (data.response) {
            addMessage('obiwon', data.response);
        }
    } catch (err) {
        console.error("Chat error:", err);
        if (typing) typing.classList.remove('show');
    }
}

function sendText() {
    const input = document.getElementById('textInput');
    const text = input.value.trim();
    if (!text) return;

    addMessage('user', text);
    ask(text);
    input.value = '';
}

function addMessage(role, text) {
    const chatBox = document.getElementById('conversationArea');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isObiwon = role === 'obiwon';
    const avatarImg = isObiwon ? 'Obiwon-portrait-wise.jpeg' : '';

    msgDiv.innerHTML = `
        <div class="msg-avatar">
            ${isObiwon ? `<img src="${avatarImg}" alt="AI" onerror="this.parentElement.innerHTML='🧙';">` : '👤'}
        </div>
        <div class="msg-body">
            <div class="msg-bubble">${text}</div>
            <div class="msg-time ${!isObiwon ? 'msg-time-user' : ''}">${time}</div>
        </div>
    `;

    const typingInd = document.getElementById('typingInd');
    if (typingInd) {
        typingInd.insertAdjacentElement('afterend', msgDiv);
    } else {
        chatBox.prepend(msgDiv);
    }
    // Since latest is on top, we don't need to scroll to bottom.
}

// ─── TTS & BILINGUAL LOGIC ──────────────────────────────────────

async function speakText(text) {
    if (!AppState.settings.ttsEnabled) return;

    // Strict French detection to avoid false positives triggering the female voice
    const frWords = text.match(/\b(le|la|les|des|est|vous|nous|pour|dans|un|une|qui|que)\b/gi);
    const isFrench = (frWords && frWords.length >= 2);

    const voice = isFrench ? 'ff_siwis' : 'bm_daniel';

    const vizFrame = document.getElementById('vizFrame');
    if (vizFrame) vizFrame.classList.add('speaking');

    try {
        const response = await fetch(`${API_BASE_URL}/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice })
        });

        if (!response.ok) throw new Error('TTS fetch failed');

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        // Simulating visualizer during speech
        const speechSync = setInterval(() => {
            const bars = document.querySelectorAll('.viz-bar');
            bars.forEach(b => {
                const h = 5 + Math.random() * 45;
                b.style.height = h + 'px';
                b.style.animation = 'none';
            });
        }, 100);

        audio.onended = () => {
            clearInterval(speechSync);
            URL.revokeObjectURL(audioUrl);
            if (vizFrame) vizFrame.classList.remove('speaking');
            resetVisualizer();
        };

        await audio.play();

    } catch (error) {
        console.error('Kokoro TTS Error, falling back to browser:', error);
        fallbackToBrowserTTS(text);
        if (vizFrame) vizFrame.classList.remove('speaking');
        resetVisualizer();
    }
}

function fallbackToBrowserTTS(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const isFrench = /[\\u00C0-\\u00FF]/.test(text);
    const voices = window.speechSynthesis.getVoices();
    if (isFrench) {
        utterance.voice = voices.find(v => v.lang.startsWith('fr-')) || voices[0];
    } else {
        utterance.voice = voices.find(v => v.lang.startsWith('en-GB')) || voices[0];
    }
    window.speechSynthesis.speak(utterance);
}
