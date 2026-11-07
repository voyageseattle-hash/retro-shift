#!/bin/bash
# The announcer's voice, for new lines that sit with the ones in audio/voice/:
#   tools/announcer/make.sh "Chain reaction!" audio/voice/chain5.mp3 [speed]
#
# Kokoro-82M (Apache-2.0), voice am_fenrir, then the 90s-cabinet chain the shipped clips were matched by ear-less
# measurement (pitch ~115-125 Hz, spectrum within ~2-3 dB, loudness, echo taps): pitched down with the formants kept
# (crisp transients so the consonants survive), cabinet EQ, a little tanh saturation and bit-crush, compression,
# slapback taps over a dark hall, a limiter, -0.2 dB peak, MP3 CBR 80k mono like the rest.
#
# Setup (once): a Python venv with kokoro-onnx, soundfile and scipy; ffmpeg built with rubberband; the model files
# kokoro-v1.0.onnx and voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0).
#   VENV=path/to/venv MODEL=path/to/model-dir tools/announcer/make.sh ...
# Worth a check before shipping a line: a speech recognizer (whisper base.en through sherpa-onnx) heard all of
# chain3/5/8, perfect and takedown right; "Super chain" and "Max chain" came out as "Super train" and "Max dream".
set -e
here=$(cd "$(dirname "$0")" && pwd)
text=$1; out=$2; speed=${3:-1.0}
py=${VENV:?set VENV to the Python venv}/bin/python
T=$(mktemp -d)
"$py" -I "$here/say.py" "${MODEL:?set MODEL to the folder with the model files}" "$T/raw.wav" am_fenrir "$speed" "$text"
ffmpeg -v error -y -i "$T/raw.wav" -af "aresample=44100,silenceremove=start_periods=1:start_threshold=-45dB,\
rubberband=pitch=0.66:formant=preserved:transients=crisp:window=short,highpass=f=65,\
equalizer=f=450:t=q:w=1.0:g=-3,equalizer=f=3200:t=q:w=1.0:g=4,\
volume=6dB,asoftclip=type=tanh:oversample=4,acrusher=bits=9:mode=log:aa=1:mix=0.3,lowpass=f=9000:p=2,\
acompressor=threshold=0.06:ratio=6:attack=3:release=70:makeup=1" -ac 1 "$T/dry.wav"
"$py" -I "$here/hall.py" "$T/dry.wav" "$T/wet.wav"
ffmpeg -v error -y -i "$T/wet.wav" -af "alimiter=level_in=2.5:limit=0.9:attack=1:release=60:level=disabled" "$T/lim.wav"
pk=$(ffmpeg -v info -i "$T/lim.wav" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB/\1/p')
g=$(python3 -c "print(-0.2 - ($pk))")
ffmpeg -v error -y -i "$T/lim.wav" -af "volume=${g}dB" -c:a libmp3lame -b:a 80k -ac 1 -ar 44100 "$out"
rm -rf "$T"
echo "$out"
