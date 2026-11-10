// Counts how often cars wreck and fall off, per course and cause: a full race with rivals, the player's car driven by
// a sloppy AI (low skill, a little steering noise) standing in for a human. Run it before and after tuning damage.
//   node tools/crash-stats.mjs [--only core,city] [--laps 2] [--skill 0.5] [--noise 0.25]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ids = flag('--only', 'core,layered,tunnels,orbital,city,void,helix,fractal,lattice,ruins,dream').split(',');
const laps = Number(flag('--laps', 2));
const skill = Number(flag('--skill', 0.5));
const noise = Number(flag('--noise', 0.25));

const port = 8000 + Math.floor(Math.random() * 1000);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const total = {};
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(`http://127.0.0.1:${port}/?track=${id}&mode=race&staff=1`);
  await page.waitForFunction(() => window.app?.race);
  const res = await page.evaluate(({ laps, skill, noise }) => {
    const R = app.race;
    R.laps = laps;
    const p = R.player;
    p.ai.skill = skill;
    const log = [];
    const where = () => {
      // the first caller that isn't the hull bookkeeping
      const lines = new Error().stack.split('\n').slice(3).map((s) => (s.match(/\/js\/(.+?):(\d+)/) || []).slice(1, 3).join(':'));
      return lines.find((l) => l && !/race\.js:(2[89]\d|30\d)$/.test(l)) || lines[0];
    };
    const wreck = R.wreck.bind(R);
    R.wreck = (r, by) => {
      if (r.respawnT <= 0 && !r.finished) log.push({ k: by ? 'takedown' : 'wreck', who: r.isPlayer ? 'P' : 'cpu', at: where(), u: +r.lastU.toFixed(2), hp: r.hp });
      wreck(r, by);
    };
    const fell = R.onFell.bind(R);
    R.onFell = (r) => {
      if (r.respawnT <= 0) {
        const t = r.track, P = t?.path;
        const rail = P ? (t.lat < 0 ? P.railL[t.i] : P.railR[t.i]) : -1;
        log.push({ k: 'fall', who: r.isPlayer ? 'P' : 'cpu', at: where(), u: +r.lastU.toFixed(2), mode: r.mode, why: `path ${P?.id} lat ${t?.lat.toFixed(1)}/${P?.halfW} rail ${rail} mask ${P?.mask[t.i]} spd ${r.speed.toFixed(0)} y-road ${(r.pos.y - (P?.py[t.i] ?? 0)).toFixed(1)}` });
      }
      fell(r);
    };
    // the stand-in human: the AI's line plus a wandering steering error
    const upd = p.ai.update.bind(p.ai);
    let err = 0;
    p.ai.update = (dt) => {
      upd(dt);
      err += (Math.random() - 0.5) * 6 * dt - err * 0.8 * dt;
      p.ctl.steer = Math.max(-1, Math.min(1, p.ctl.steer + err * noise * 4));
    };
    let steps = 0;
    while (R.state !== 'finished' && steps < 60 * 60 * 6) {
      R.update(1 / 60);
      steps++;
      if (R.state === 'race' && p.finished) break;
    }
    return { log, time: p.finishTime, place: R.finishOrder.indexOf(p) + 1, end: `lap ${p.lap} u ${p.lastU.toFixed(2)} spd ${p.speed.toFixed(0)} wrong ${(p.wrongWay||0).toFixed(1)} path ${p.track?.path.id} lat ${p.track?.lat.toFixed(1)}` };
  }, { laps, skill, noise });
  await page.close();
  const c = {};
  for (const e of res.log) {
    const key = `${e.who} ${e.k}`;
    c[key] = (c[key] || 0) + 1;
    total[key] = (total[key] || 0) + 1;
  }
  console.log(`${id}: ${JSON.stringify(c)}  player ${res.time ? res.time.toFixed(1) + "s" : "DNF " + res.end}`);
  for (const e of res.log) if (e.who === 'P') console.log(`    ${e.k} at ${e.at} u=${e.u}${e.mode !== undefined ? ' mode ' + e.mode + ' ' + e.why : ''}`);
  const cpu = {};
  for (const e of res.log) if (e.who === 'cpu' && e.k === 'fall') console.log(`    cpu fall u=${e.u} mode ${e.mode} ${e.why}`);
  for (const e of res.log) if (e.who === 'cpu') cpu[`${e.k} ${e.at}`] = (cpu[`${e.k} ${e.at}`] || 0) + 1;
  console.log('    cpu:', JSON.stringify(cpu));
}
console.log('TOTAL', JSON.stringify(total));
await browser.close();
server.kill();
