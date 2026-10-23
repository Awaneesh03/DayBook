// Runs every browser test suite one after another and fails if any of them fails.
// Run: npm test   (or: node tests/run_all.mjs [path/to/index.html or http(s) URL])     ONLY="text" is passed on to each suite.
// With no argument it serves the repository on a local port and tests that served copy, as people use Daybook: browsers
// keep sessionStorage across a reload for served pages, which Chromium on Linux does not always do for pages opened from disk.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
let server = null, target = process.argv[2];
if (!target) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
  server = http.createServer((req, res) => {
    const p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = path.join(root, p || 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  target = `http://127.0.0.1:${server.address().port}/index.html`;
}
console.log('testing ' + target);
const suites = ['transitions', 'weather_audio', 'stability', 'tour', 'backup', 'saving', 'planner', 'a11y', 'journey'];
const results = [];
for (const s of suites) {
  console.log(`\n=== ${s} ===`);
  const t0 = Date.now();
  // not spawnSync: this process has to keep serving the page while the suite runs
  const r = await new Promise(resolve => {
    const c = spawn(process.execPath, [path.join(here, `test_${s}.mjs`), target], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', d => { out += d; process.stdout.write(d); });
    c.on('close', status => resolve({ status, out }));
  });
  results.push({ s, code: r.status, pass: (r.out.match(/^PASS /gm) || []).length, fail: (r.out.match(/^FAIL /gm) || []).length, secs: Math.round((Date.now() - t0) / 1000) });
}
if (server) server.close();
console.log('\n=== summary ===');
for (const r of results) console.log(`${r.code === 0 ? 'ok  ' : 'FAIL'} ${r.s.padEnd(14)} ${r.pass} passed, ${r.fail} failed (${r.secs} s)`);
process.exit(results.some(r => r.code !== 0) ? 1 : 0);
