// Renders Retro Shift songs to WAV so they can be heard without running the game. Each preview runs the song in
// BOTH, then RED, then BLUE, then BOTH, then the final-lap version.
//   node tools/render-audio.mjs [outDir] [--only circuit,grid] [--seconds 56]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const only = flag('--only')?.split(',');
const secs = Number(flag('--seconds') || 56);
const outDir = args[0] || join(root, 'audio-previews');
mkdirSync(outDir, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 1000);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://127.0.0.1:${port}/tools/audio-render.html`);
await page.waitForFunction(() => window.ready === true);
const ids = await page.evaluate(async () => Object.keys((await import('../js/core/songs.js')).SONGS));
const q = secs / 7;
for (const id of ids) {
  if (only && !only.includes(id)) continue;
  const ev = [[q * 2, 'red'], [q * 3, 'blue'], [q * 4, 'both'], [q * 5, 'hot']];
  const res = await page.evaluate(([id, s, ev]) => window.renderSong(id, s, ev), [id, secs, ev]);
  writeFileSync(join(outDir, `${id}.wav`), Buffer.from(res.wav, 'base64'));
  console.log(`${id}.wav  peak ${res.peak.toFixed(2)}  rms ${(20 * Math.log10(res.rms)).toFixed(1)} dBFS`);
}
await browser.close();
server.kill();
