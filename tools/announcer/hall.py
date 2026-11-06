# hall.py <in.wav> <out.wav>: the announcer's room. Slapback taps at 45, 70, 150, 285 and 565 ms (where the cepstrum
# of the shipped clips peaks) over a long, dark hall (RT60 2.2 s, 160 Hz-5 kHz), faded out 0.75 s after the words.
import sys
import numpy as np
import soundfile as sf
from scipy import signal

TAIL_DB, RT60, FADE_AT, TAPS = -22, 2.2, 0.75, 0.2
inp, out = sys.argv[1:3]
x, sr = sf.read(inp)
if x.ndim > 1:
    x = x.mean(1)
rng = np.random.default_rng(7)
n = int(sr * 2.6)
t = np.arange(n) / sr
noise = rng.standard_normal(n) * np.exp(-6.91 * t / RT60) * (t > 0.03)
b, a = signal.butter(2, [160 / (sr / 2), 5000 / (sr / 2)], 'band')
noise = signal.lfilter(b, a, noise)
ir = noise / np.sqrt(np.sum(noise ** 2)) * 10 ** (TAIL_DB / 20)
for d, g in [(0.045, 0.16), (0.070, 0.30), (0.150, 0.24), (0.285, 0.17), (0.565, 0.10)]:
    ir[int(d * sr)] += g * TAPS
ir[0] = 1.0
y = signal.fftconvolve(x, ir)[: len(x) + n]
# the words end where the dry voice last sits within 30 dB of its peak
h = int(0.01 * sr)
env = np.array([np.sqrt(np.mean(x[i:i + h] ** 2)) for i in range(0, len(x) - h, h)])
end = (np.where(env > env.max() * 10 ** (-30 / 20))[0][-1] + 1) * h
f0, f1 = end + int(FADE_AT * sr), end + int((FADE_AT + 0.22) * sr)
fade = np.ones(len(y))
fade[f0:f1] = np.linspace(1, 0, f1 - f0) ** 2
fade[f1:] = 0
y = (y * fade)[: f1 + int(0.35 * sr)]
y /= np.max(np.abs(y)) / 0.9
sf.write(out, y, sr)
