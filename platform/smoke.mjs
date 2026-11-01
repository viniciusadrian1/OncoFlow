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
  env: { ...process.env, PORT: String(port), ONCOFLOW_DEMO_AUTO_CONNECT: 'true', ONCOFLOW_PATIENT_WEB_DIR: path.join(root, 'dist/app'),
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
  const configResponse = await fetch(`${base}/api/mobile/config`); assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.equal(config.apiVersion, '1'); assert.equal(config.demo, true); assert.equal(config.autoConnectEnabled, true);
  assert.equal(config.serviceUrl, base);
  const patientsResponse = await fetch(`${base}/api/mobile/demo-patients`); assert.equal(patientsResponse.status, 200);
  const patients = await patientsResponse.json();
  assert.ok(patients.patients.some(patient => patient.id === config.defaultPatientId));
  const automatic = await fetch(`${base}/api/mobile/demo-session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ patientId: config.defaultPatientId }) });
  assert.equal(automatic.status, 200);
  const session = await automatic.json(); assert.equal(session.demo, true);
  const teamHeaders = { 'content-type': 'application/json', 'x-demo-usuario': 'usr-carla' };
  const state = await (await fetch(`${base}/api/pro/estado`, { headers: teamHeaders })).json();
  assert.ok(state.pacientes.length);
  const selected = state.pacientes.find(patient => patient.id === config.defaultPatientId); assert.ok(selected);
  const { tenantId, hospitalId, patientId } = session.scope;
  const scoped = `${base}/api/v1/tenants/${tenantId}/hospitals/${hospitalId}/patients/${patientId}`;
  const patientHeaders = { authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json' };
  const summary = await fetch(`${scoped}/summary`, { headers: patientHeaders });
  assert.equal(summary.status, 200); assert.equal((await summary.json()).data.displayName, selected.nome);
  const literal = 'Estou com febre e vomitando agora. Relato fictício de verificação da plataforma.';
  const key = `platform-symptom-${Date.now()}`;
  const reportInput = { text: literal, source: 'text', locale: 'pt-BR', idempotencyKey: key };
  const submitReport = () => fetch(`${scoped}/symptom-reports`, { method: 'POST', headers: { ...patientHeaders, 'Idempotency-Key': key }, body: JSON.stringify(reportInput) });
  const accepted = await submitReport(); assert.equal(accepted.status, 200);
  const report = await accepted.json(); assert.equal(report.data.reviewRequired, true); assert.ok(report.data.alertId);
  const repeated = await submitReport(); assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).data.id, report.data.id);
  const withReport = await (await fetch(`${base}/api/pro/estado`, { headers: teamHeaders })).json();
  const actualPatient = withReport.pacientes.find(patient => patient.id === selected.id);
  const signal = actualPatient.pendencias.find(pending => pending.id === report.data.alertId);
  assert.equal(signal.tipo, 'sinal_urgencia'); assert.equal(signal.origem, 'hipotese_sistema');
  assert.equal(signal.falaLiteral, literal); assert.equal(signal.estado, 'aberta');
  assert.equal(actualPatient.pendencias.filter(pending => pending.falaLiteral === literal).length, 1);
  assert.ok(actualPatient.mensagens.some(message => message.autor === 'paciente' && message.texto === literal));
  assert.equal(withReport.pacientes.filter(patient => patient.id !== selected.id).some(patient => patient.pendencias.some(pending => pending.falaLiteral === literal)), false);
  const replyText = 'Recebemos seu relato fictício. A equipe fará a revisão conforme as regras do serviço.';
  const reply = await fetch(`${base}/api/pro/pacientes/${selected.id}/mensagens`, { method: 'POST', headers: teamHeaders, body: JSON.stringify({ texto: replyText }) });
  assert.equal(reply.status, 200);
  const messagesResponse = await fetch(`${scoped}/messages`, { headers: patientHeaders }); assert.equal(messagesResponse.status, 200);
  const messages = await messagesResponse.json(); assert.ok(messages.data.some(message => message.role === 'team' && message.text === replyText));
  // Advanced pairing remains compatible, independently of the default automatic entry.
  const pairing = await fetch(`${base}/api/pro/pacientes/${selected.id}/mobile-pairing`, { method: 'POST', headers: teamHeaders, body: '{}' });
  assert.equal(pairing.status, 200);
  const { code } = await pairing.json();
  const paired = await fetch(`${base}/api/mobile/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  assert.equal(paired.status, 200);
  assert.equal((await paired.json()).scope.patientId, selected.id);
  console.log('PASS: bundled frontends, automatic app entry, scoped summary, idempotent symptom report → Pro signal/message → professional reply → patient message, advanced pairing.');
} finally {
  if (child.exitCode === null) {
    if (process.platform === 'win32') await promisify(execFile)('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    else {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
  }
}
