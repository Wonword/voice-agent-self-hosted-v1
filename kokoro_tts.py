#!/usr/bin/env python3
"""Kokoro TTS script for voice agent"""
import sys
import os

# Ensure we're using the virtual environment
venv_path = '/Users/obiwon/.openclaw/workspace/skills/voice-agent/venv'
if os.path.exists(venv_path):
    sys.path.insert(0, os.path.join(venv_path, 'lib/python3.14/site-packages'))

try:
    from kokoro_onnx import Kokoro
    import numpy as np
    from pathlib import Path
except ImportError as e:
    print(f"Error importing Kokoro: {e}", file=sys.stderr)
    sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print("Usage: kokoro_tts.py <text> <output_wav>", file=sys.stderr)
        sys.exit(1)
    
    text = sys.argv[1]
    output_path = sys.argv[2]
    
    try:
        # Initialize Kokoro with British male voice (Obi-Wan style)
        # af_bella is a high-quality female voice, but for male we can use other options
        kokoro = Kokoro("hf://hexgrad/kokoro-tts/Kokoro-82M-v1.0-ONNX", "af_bella")
        
        # Generate audio
        samples = kokoro.tts(text)
        
        # Save as WAV
        import wave
        with wave.open(output_path, 'w') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(24000)  # 24kHz
            wav_file.writeframes((samples * 32767).astype(np.int16).tobytes())
        
        print(f"Generated: {output_path}")
        
    except Exception as e:
        print(f"TTS Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
