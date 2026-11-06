# say.py <model_dir> <out.wav> <voice> <speed> <text>: one line through Kokoro (kokoro-onnx)
import sys
import soundfile as sf
from kokoro_onnx import Kokoro

model_dir, out, voice, speed, text = sys.argv[1:6]
k = Kokoro(f"{model_dir}/kokoro-v1.0.onnx", f"{model_dir}/voices-v1.0.bin")
samples, sr = k.create(text, voice=voice, speed=float(speed), lang="en-us")
sf.write(out, samples, sr)
