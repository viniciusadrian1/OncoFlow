/** Run against vercel dev --local with isolated ONCOFLOW_DEMO_STATE_PATH. No provider calls. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const target = new URL(process.argv[2] || 'http://invalid/');
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.pathname !== '/' || target.search || target.hash || target.username || target.password) throw new Error('Pass the loopback URL of your isolated vercel dev --local instance.');
const base = target.origin;
async function call(path, options = {}) {
  return fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
}
async function json(path, options = {}) {
  const response = await call(path, options);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/, path);
  return response.json();
}
const healthResponse = await call('/api/health');
assert.match(healthResponse.headers.get('server') ?? '', /vercel/i, 'use the Vercel router, not the standalone server');
assert.match(healthResponse.headers.get('content-type') ?? '', /application\/json/);
assert.equal((await healthResponse.json()).service, 'OncoFlow');
const root = await call('/'); assert.equal(root.status, 200); assert.match(root.headers.get('content-type') ?? '', /text\/html/);
const redirect = await call('/app', { redirect: 'manual' }); assert.ok([301, 308].includes(redirect.status)); assert.match(redirect.headers.get('location') ?? '', /\/app\/$/);
const patient = await call('/app/'); assert.equal(patient.status, 200);
const html = await patient.text(); assert.match(html, /Sua jornada de cuidado/);
const modules = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]);
assert.ok(modules.length);
for (const script of modules) {
  assert.ok(script.startsWith('/app/'), 'patient modules stay under the patient prefix');
  const asset = await call(script); assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type') ?? '', /javascript/);
}
for (const path of ['/app/brand/icon-192.png', '/app/vad/silero_vad_v5.onnx']) {
  const asset = await call(path, { method: 'HEAD' }); assert.equal(asset.status, 200); assert.doesNotMatch(asset.headers.get('content-type') ?? '', /text\/html/);
}
const config = await json('/api/mobile/config'); assert.equal(config.autoConnectEnabled, true); assert.equal(config.serviceUrl, base);
const session = await json('/api/mobile/demo-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patientId: config.defaultPatientId }) });
assert.equal(session.scope.patientId, config.defaultPatientId);
const scoped = `/api/v1/tenants/${session.scope.tenantId}/hospitals/${session.scope.hospitalId}/patients/${session.scope.patientId}`;
const patientHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` };
const summary = await json(`${scoped}/summary`, { headers: patientHeaders }); assert.equal(summary.data.displayName, session.patient.displayName);
const key = `services-smoke-${crypto.randomUUID()}`;
const literal = 'Estou com febre e vomitando agora.';
const reportOptions = { method: 'POST', headers: { ...patientHeaders, 'Idempotency-Key': key }, body: JSON.stringify({ text: literal, source: 'text', locale: 'pt-BR', idempotencyKey: key }) };
const report = await json(`${scoped}/symptom-reports`, reportOptions); assert.equal(report.data.status, 'recorded');
assert.equal((await json(`${scoped}/symptom-reports`, reportOptions)).data.id, report.data.id);
const teamHeaders = { 'Content-Type': 'application/json', 'x-demo-usuario': 'usr-carla' };
const pro = await json('/api/pro/estado', { headers: teamHeaders });
const signal = pro.pacientes.find(patient => patient.id === session.scope.patientId).pendencias.find(pending => pending.id === report.data.alertId);
assert.equal(signal.falaLiteral, literal); assert.equal(signal.estado, 'aberta');
const reply = 'Resposta fictícia para verificar a comunicação entre as experiências.';
await json(`/api/pro/pacientes/${session.scope.patientId}/mensagens`, { method: 'POST', headers: teamHeaders, body: JSON.stringify({ texto: reply }) });
assert.ok((await json(`${scoped}/messages`, { headers: patientHeaders })).data.some(message => message.role === 'team' && message.text === reply));

const require = createRequire(new URL('../patient-app/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base + '/app/');
  await page.getByRole('button', { name: 'Entrar no app', exact: true }).click();
  await page.getByRole('heading', { name: /^Olá, Maria\.$/ }).waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await page.getByLabel('Código de pareamento', { exact: true }).count(), 0);
  await mkdir(new URL('../test-results/services/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../test-results/services/patient-connected.png', import.meta.url)), fullPage: true });
} finally { await browser.close(); }
console.log('PASS: Vercel Services routing, patient assets/VAD, browser one-click entry, JSON API, idempotent report → Pro signal → team reply → patient.');
