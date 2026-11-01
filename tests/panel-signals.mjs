// Use only an isolated server/state file. Never reset a shared demo.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '../patient-app/node_modules/playwright/index.mjs';

const base = process.env.PANEL_TEST_URL || 'http://localhost:5187';
const signalEndpoint = process.env.PANEL_SIGNAL_ENDPOINT || 'symptom-reports';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const team = { 'content-type': 'application/json', 'x-demo-usuario': 'usr-rodrigo' };
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let navigations = 0;
page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
const state = async () => {
  const response = await page.request.get(`${base}/api/pro/estado`, { headers: team });
  assert.equal(response.status(), 200); return response.json();
};

try {
  await mkdir('test-results/panel', { recursive: true });
  await page.goto(base);
  await page.locator('#btn-entrar-usr-rodrigo').click();
  const indicator = page.getByTestId('indicator-sinais');
  await indicator.waitFor({ timeout: 8000 });
  const before = await state();
  const initial = before.pacientes.flatMap(patient => patient.pendencias).filter(item => item.tipo === 'sinal_urgencia' && item.estado !== 'concluida').length;
  const initialNavigations = navigations;
  const pairedCode = await page.request.post(`${base}/api/pro/pacientes/pac-maria/mobile-pairing`, { headers: team, data: {} });
  assert.equal(pairedCode.status(), 200);
  const paired = await page.request.post(`${base}/api/mobile/pair`, { data: { code: (await pairedCode.json()).code } });
  assert.equal(paired.status(), 200);
  const session = await paired.json();
  const { tenantId, hospitalId, patientId } = session.scope;
  const literal = `Estou com falta de ar agora. Relato fictício de verificação ${Date.now()}.`;
  const operationKey = `panel-signal-${Date.now()}`;
  const received = await page.request.post(`${base}/api/v1/tenants/${tenantId}/hospitals/${hospitalId}/patients/${patientId}/${signalEndpoint}`, {
    headers: { authorization: `Bearer ${session.accessToken}`, 'Idempotency-Key': operationKey }, data: {
      text: literal, source: 'voice', idempotencyKey: operationKey,
      ...(signalEndpoint === 'messages' ? { confirmation: { confirmed: true, confirmedAt: new Date().toISOString() } } : { locale: 'pt-BR' }),
    },
  });
  assert.equal(received.status(), 200);
  const after = await state();
  assert.ok(after.versao > before.versao);
  const patient = after.pacientes.find(item => item.id === 'pac-maria');
  const signal = patient.pendencias.find(item => item.tipo === 'sinal_urgencia' && item.falaLiteral === literal);
  assert.ok(signal, 'the patient message creates an operational signal');
  assert.equal(signal.origem, 'hipotese_sistema');
  assert.equal(after.pacientes.filter(item => item.id !== 'pac-maria').some(item => item.pendencias.some(pending => pending.falaLiteral === literal)), false);
  await page.waitForFunction(expected => document.querySelector('[data-testid="signal-count"]')?.textContent === String(expected), initial + 1, { timeout: 8000 });
  assert.equal(navigations, initialNavigations, 'an already-open Pro page receives the signal without reloading');
  assert.match(await indicator.innerText(), /Sinais a revisar/);
  const patientRow = page.getByRole('button').filter({ hasText: 'Maria Oliveira Costa' }).first();
  assert.match(await patientRow.innerText(), /Sinal a revisar/);
  await indicator.click();
  await page.getByRole('heading', { name: 'Sinais aguardando revisão' }).waitFor();
  const article = page.locator(`[data-pendencia-id="${signal.id}"]`);
  await article.waitFor();
  assert.match(await article.innerText(), /Maria Oliveira Costa/);
  assert.match(await article.innerText(), /Hipótese do sistema · aguardando revisão/);
  assert.match(await article.innerText(), /Fala literal do paciente/i);
  assert.ok((await article.innerText()).includes(literal));
  assert.match(await article.innerText(), /Estado: Aberta/);
  assert.match(await article.innerText(), /Responsável: A definir/);
  assert.match(await article.innerText(), /Encaminhado automaticamente pelas regras do serviço/);
  assert.match(await article.innerText(), /prioridade clínica depende de avaliação profissional/);
  assert.equal(await article.getByRole('button', { name: 'Concluir revisão' }).isDisabled(), true);
  assert.equal(await page.getByRole('alert').count(), 0, 'live signals update the existing surfaces without stacking banners');
  await page.screenshot({ path: 'test-results/panel/signal-live-received.png' });
  const claimPath = `**/api/pro/pendencias/${signal.id}/assumir`;
  await page.route(claimPath, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ mensagem: 'Não foi possível assumir a revisão de teste.' }) }));
  await article.getByRole('button', { name: 'Assumir revisão' }).click();
  await article.getByRole('alert').filter({ hasText: 'Não foi possível assumir' }).waitFor();
  assert.match(await article.innerText(), /Estado: Aberta/);
  assert.equal((await state()).pacientes.find(item => item.id === 'pac-maria').pendencias.find(item => item.id === signal.id).responsavel, undefined);
  await page.unroute(claimPath);
  let successfulClaimPosts = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith(`/pendencias/${signal.id}/assumir`)) successfulClaimPosts++; });
  await article.getByRole('button', { name: 'Assumir revisão' }).evaluate(button => { button.click(); button.click(); });
  await page.waitForFunction(id => document.querySelector(`[data-pendencia-id="${id}"]`)?.textContent.includes('Estado: Em revisão'), signal.id);
  assert.match(await article.innerText(), /Responsável: Nurse Rodrigo Mendes/);
  assert.equal(successfulClaimPosts, 1, 'two immediate clicks submit one claim');
  await article.getByLabel('Desfecho da revisão').selectOption('contato_realizado');
  await article.getByRole('button', { name: 'Concluir revisão' }).click();
  await article.waitFor({ state: 'detached' });
  const reviewed = (await state()).pacientes.find(item => item.id === 'pac-maria').pendencias.find(item => item.id === signal.id);
  assert.equal(reviewed.estado, 'concluida');
  assert.equal(reviewed.desfecho, 'contato_realizado');
  assert.equal(reviewed.falaLiteral, literal);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.waitForFunction(expected => document.querySelector('[data-testid="signal-count"]')?.textContent === String(expected), initial);
  assert.deepEqual(errors, []);
  console.log('PASS: automatic live signal in open Pro, patient isolation, literal/hypothesis/state/owner, required outcome, claim and completion.');
} finally { await browser.close(); }
