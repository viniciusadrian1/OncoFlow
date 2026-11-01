/** Production smoke check: the launcher serves Pro, the bundled app and the scoped API. No AI calls. */
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
await mkdir(path.join(root, 'test-results'), { recursive: true });
const child = spawn(process.execPath, [path.join(root, 'platform/start.mjs')], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), ONCOFLOW_PATIENT_WEB_DIR: path.join(root, 'dist/app'),
    ONCOFLOW_DEMO_STATE_PATH: path.join(root, `test-results/platform-smoke-${Date.now()}.json`) },
});
// Keep output local, without logging response bodies, pair codes or credentials.
let startup = '';
child.stdout.on('data', chunk => { startup += chunk; });
child.stderr.on('data', chunk => { startup += chunk; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`Iniciador encerrou: ${startup}`);
    try { ready = (await fetch(`${base}/api/health`)).ok; } catch { /* server is still starting */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'production server becomes healthy');
  assert.match(startup, /demonstração fictícia/);
  assert.equal((await fetch(`${base}/`)).status, 200);
  const app = await fetch(`${base}/app/`);
  assert.equal(app.status, 200);
  const html = await app.text();
  assert.equal(html, await readFile(path.join(root, 'dist/app/index.html'), 'utf8'), 'app is served from the bundled output');
  const asset = html.match(/src="\.\/([^\"]+\.js)"/)[1];
  const javascript = await fetch(`${base}/app/${asset}`);
  assert.equal(javascript.status, 200); assert.match(javascript.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(`${base}/app/visual/lia-orb.svg`)).status, 200);
  assert.equal((await fetch(`${base}/app/vad/silero_vad_v5.onnx`, { method: 'HEAD' })).status, 200);
  const teamHeaders = { 'content-type': 'application/json', 'x-demo-usuario': 'usr-carla' };
  const state = await (await fetch(`${base}/api/pro/estado`, { headers: teamHeaders })).json();
  assert.ok(state.pacientes.length);
  const selected = state.pacientes[0];
  const pairing = await fetch(`${base}/api/pro/pacientes/${selected.id}/mobile-pairing`, { method: 'POST', headers: teamHeaders, body: '{}' });
  assert.equal(pairing.status, 200);
  const { code } = await pairing.json();
  const paired = await fetch(`${base}/api/mobile/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  assert.equal(paired.status, 200);
  const session = await paired.json();
  assert.equal(session.demo, true);
  const { tenantId, hospitalId, patientId } = session.scope;
  const summary = await fetch(`${base}/api/v1/tenants/${tenantId}/hospitals/${hospitalId}/patients/${patientId}/summary`, { headers: { authorization: `Bearer ${session.accessToken}` } });
  assert.equal(summary.status, 200);
  assert.equal((await summary.json()).data.displayName, selected.nome);
  console.log('PASS: production launcher, bundled /app assets/VAD, Pro, pairing and patient-scoped API.');
} finally {
  if (child.exitCode === null) {
    if (process.platform === 'win32') await promisify(execFile)('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    else {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
  }
}
