#!/usr/bin/env python3
"""Kokoro TTS script for voice agent (Daniel voice)"""
import sys
import os

# Ensure we're using the local virtual environment
script_dir = os.path.dirname(os.path.abspath(__file__))
venv_path = os.path.join(script_dir, 'venv')
if os.path.exists(venv_path):
    # This matches the structure created by python3 -m venv
    site_packages = os.path.join(venv_path, 'lib', f'python{sys.version_info.major}.{sys.version_info.minor}', 'site-packages')
    sys.path.insert(0, site_packages)

try:
    from kokoro_onnx import Kokoro
    import numpy as np
except ImportError as e:
    print(f"Error importing Kokoro dependencies: {e}", file=sys.stderr)
    print(f"Path searched: {sys.path}", file=sys.stderr)
    sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print("Usage: kokoro_tts.py <text> <output_wav> [voice]", file=sys.stderr)
        sys.exit(1)
    
    text = sys.argv[1]
    output_path = sys.argv[2]
    voice_id = sys.argv[3] if len(sys.argv) > 3 else "bm_daniel"
    
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(script_dir, "kokoro-v1.0.onnx")
        voices_path = os.path.join(script_dir, "voices-v1.0.bin")
        
        if not os.path.exists(model_path) or not os.path.exists(voices_path):
            print(f"Error: Required files not found in {script_dir}", file=sys.stderr)
            sys.exit(1)

        kokoro = Kokoro(model_path, voices_path)
        
        # Language detection based on voice prefix or context
        lang = "en-gb"
        if voice_id.startswith("af") or voice_id.startswith("am"):
            lang = "en-us"
        elif voice_id.startswith("bf") or voice_id.startswith("bm"):
            lang = "en-gb"
        elif voice_id.startswith("ff"):
            lang = "fr-fr"
        elif voice_id.startswith("jf") or voice_id.startswith("jm"):
            lang = "ja"
        elif voice_id.startswith("zf") or voice_id.startswith("zm"):
            lang = "zh"

        print(f"Generating voice '{voice_id}' (lang: {lang}) for text: {text[:50]}...")
        
        # Generate audio
        samples, sample_rate = kokoro.create(text, voice=voice_id, speed=1.0, lang=lang)
        
        # Save as WAV using wave module
        import wave
        with wave.open(output_path, 'w') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes((samples * 32767).astype(np.int16).tobytes())
        
        print(f"Generated: {output_path}")
        
    except Exception as e:
        print(f"TTS Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
