// Records the staff ghosts: the race AI drives each course alone at full skill, a few times over, and the fastest
// clean run becomes data/staff/<course>.json (Time Trial) or data/staff/<course>-mono.json (Mono Run).
//   node tools/make-staff.mjs [--only core,helix] [--tries 3] [--mono-only | --trial-only]
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
const tries = Number(flag('--tries') || 3);
const kinds = args.includes('--mono-only') ? ['mono'] : args.includes('--trial-only') ? ['trial'] : ['trial', 'mono'];
const outDir = join(root, 'data', 'staff');
mkdirSync(outDir, { recursive: true });

const port = 8000 + Math.floor(Math.random() * 1000);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ids = only || ['core', 'layered', 'tunnels', 'orbital', 'city', 'void', 'helix', 'fractal', 'lattice', 'ruins', 'relativity'];
for (const id of ids) {
  for (const kind of kinds) {
    let best = null;
    for (let t = 0; t < tries; t++) {
      const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
      page.on('pageerror', (e) => console.error('  page error:', e.message));
      await page.goto(`http://127.0.0.1:${port}/?track=${id}&mode=${kind}&staff=1&car=vector`);
      await page.waitForFunction(() => window.app?.race);
      const res = await page.evaluate(() => {
        const r = app.race;
        for (let k = 0; k < 40 && r.state !== 'finished'; k++) {
          for (let s = 0; s < 600 && r.state !== 'finished'; s++) r.update(1 / 60);
        }
        const p = r.player;
        return r.state === 'finished' ? { time: p.finishTime, falls: p.falls || 0, data: r.ghostData } : { time: Infinity, falls: p.falls || 0, prog: p.prog };
      });
      await page.close();
      console.log(`  ${id} ${kind} try ${t + 1}: ${isFinite(res.time) ? res.time.toFixed(2) + 's' : 'DNF ' + res.prog?.toFixed(2)} falls ${res.falls}`);
      if (isFinite(res.time) && (!best || res.time < best.time)) best = res;
    }
    if (best) {
      const file = join(outDir, `${id}${kind === 'mono' ? '-mono' : ''}.json`);
      writeFileSync(file, JSON.stringify(best.data));
      console.log(`${id} ${kind}: staff ${best.time.toFixed(2)}s (${(JSON.stringify(best.data).length / 1024).toFixed(1)} KB)`);
    } else console.log(`${id} ${kind}: no finish`);
  }
}
await browser.close();
server.kill();
