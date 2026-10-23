// Runs every browser test suite one after another and fails if any of them fails.
// Run: npm test   (or: node tests/run_all.mjs [path/to/index.html])     ONLY="text" is passed on to each suite.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const suites = ['transitions', 'weather_audio', 'stability', 'tour', 'backup', 'saving', 'planner', 'a11y'];
const results = [];
for (const s of suites) {
  console.log(`\n=== ${s} ===`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(here, `test_${s}.mjs`), ...process.argv.slice(2)], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  const out = r.stdout || ''; process.stdout.write(out);
  results.push({ s, code: r.status, pass: (out.match(/^PASS /gm) || []).length, fail: (out.match(/^FAIL /gm) || []).length, secs: Math.round((Date.now() - t0) / 1000) });
}
console.log('\n=== summary ===');
for (const r of results) console.log(`${r.code === 0 ? 'ok  ' : 'FAIL'} ${r.s.padEnd(14)} ${r.pass} passed, ${r.fail} failed (${r.secs} s)`);
process.exit(results.some(r => r.code !== 0) ? 1 : 0);
