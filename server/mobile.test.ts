import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { criarApi } from './api';
import { adicionarMensagem, obterPaciente, resetar } from './estado';

const teamHeaders = { 'x-demo-usuario': 'usr-rodrigo' };
const timestamp = () => new Date().toISOString();
const confirmation = () => ({ confirmed: true, confirmedAt: timestamp() });
const scopePath = (patientId = 'pac-maria') => `/api/v1/tenants/demo/hospitals/oncoflow/patients/${patientId}`;

test('connected fictional demo uses real shared Pro state over HTTP, persists, and isolates patients', async t => {
  const testsRoot = path.resolve('outputs/.oncoflow-demo/tests');
  mkdirSync(testsRoot, { recursive: true });
  const folder = mkdtempSync(path.join(testsRoot, 'http-'));
  const statePath = path.join(folder, 'state.json');
  let clock = Date.now();
  let api: ReturnType<typeof criarApi>;
  let server: Server;
  let origin: string;
  async function start() {
    api = criarApi({ statePath, now: () => clock, pairingTtlMs: 1000, sessionTtlMs: 60_000 });
    await new Promise<void>(resolve => { server = api.app.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    origin = `http://127.0.0.1:${address.port}`;
  }
  async function stop() { api.dispose(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  async function call(url: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(origin + url, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, body: data, headers: response.headers };
  }
  const pro = (url: string, body: unknown = {}) => call(url, 'POST', body, teamHeaders);
  async function pair(patientId = 'pac-maria') {
    const generated = await pro(`/api/pro/pacientes/${patientId}/mobile-pairing`);
    assert.equal(generated.status, 200);
    const paired = await call('/api/mobile/pair', 'POST', { code: generated.body.code });
    assert.equal(paired.status, 200);
    assert.deepEqual(paired.body.scope, { tenantId: 'demo', hospitalId: 'oncoflow', patientId });
    assert.deepEqual(Object.keys(paired.body).sort(), ['accessToken', 'demo', 'expiresAt', 'patient', 'scope']);
    return { token: paired.body.accessToken as string, headers: { Authorization: `Bearer ${paired.body.accessToken}` }, code: generated.body.code };
  }
  resetar();
  await start();
  t.after(async () => { await stop(); assert.ok(folder.startsWith(testsRoot + path.sep)); rmSync(folder, { recursive: true, force: true }); });
  let maria: Awaited<ReturnType<typeof pair>>;
  let jose: Awaited<ReturnType<typeof pair>>;
  let requestBody: { type: string; idempotencyKey: string; confirmation: { confirmed: boolean; confirmedAt: string } };
  let requestId: string;
  let messageId: string;
  let documentId: string;
  await t.test('pairing requires team authorization, expires, and is single-use', async () => {
    assert.equal((await call('/api/pro/pacientes/pac-maria/mobile-pairing', 'POST', {})).status, 401);
    const code = await pro('/api/pro/pacientes/pac-maria/mobile-pairing');
    clock += 1001;
    assert.equal((await call('/api/mobile/pair', 'POST', { code: code.body.code })).status, 401);
    maria = await pair(); jose = await pair('pac-001');
    assert.equal((await call('/api/mobile/pair', 'POST', { code: maria.code })).status, 401);
    assert.equal((await call('/api/pro/pacientes/does-not-exist/mobile-pairing', 'POST', {}, teamHeaders)).status, 404);
    assert.equal((await call(scopePath() + '/summary', 'GET', undefined, { Authorization: 'Bearer demo-maria' })).status, 401);
  });
  await t.test('every read/write is bound to the token patient and hospital', async () => {
    for (const resource of ['summary', 'appointments', 'journey', 'documents', 'requests', 'preferences', 'messages']) {
      const response = await call(scopePath() + '/' + resource, 'GET', undefined, maria.headers);
      assert.equal(response.status, 200);
      assert.equal(response.body.apiVersion, '1');
      assert.equal(response.body.scope.patientId, 'pac-maria');
      const records = Array.isArray(response.body.data) ? response.body.data : [response.body.data];
      for (const record of records) assert.equal(record.patientId, 'pac-maria');
      assert.equal((await call(scopePath('pac-001') + '/' + resource, 'GET', undefined, maria.headers)).status, 403);
    }
    assert.equal((await call(scopePath().replace('/demo/', '/other/') + '/summary', 'GET', undefined, maria.headers)).status, 403);
    const bad = { type: 'reschedule', appointmentId: 'ag-j1', idempotencyKey: 'wrong-appointment', confirmation: confirmation() };
    assert.equal((await call(scopePath() + '/requests', 'POST', bad, { ...maria.headers, 'Idempotency-Key': bad.idempotencyKey })).status, 404);
    assert.equal((await call(scopePath('pac-001') + '/requests', 'POST', bad, { ...maria.headers, 'Idempotency-Key': bad.idempotencyKey })).status, 403);
  });
  await t.test('confirmed check-in appears once in the correct Pro patient and service review', async () => {
    const body = { feeling: 'Com dor', note: 'Fictional check-in for the connected demo.', recordedAt: timestamp(), idempotencyKey: 'checkin-one', confirmation: confirmation() };
    assert.equal((await call(scopePath() + '/wellbeing', 'POST', { ...body, confirmation: { confirmed: false, confirmedAt: timestamp() } }, { ...maria.headers, 'Idempotency-Key': body.idempotencyKey })).status, 400);
    const result = await call(scopePath() + '/wellbeing', 'POST', body, { ...maria.headers, 'Idempotency-Key': body.idempotencyKey });
    assert.equal(result.status, 200); assert.equal(result.body.data.status, 'recorded');
    assert.equal((await call(scopePath() + '/wellbeing', 'POST', body, { ...maria.headers, 'Idempotency-Key': body.idempotencyKey })).body.data.id, result.body.data.id);
    const state = (await call('/api/pro/estado', 'GET', undefined, teamHeaders)).body;
    const p = state.pacientes.find((p: any) => p.id === 'pac-maria');
    assert.equal(p.checkins.filter((c: any) => c.id === result.body.data.id).length, 1);
    assert.deepEqual(p.checkins.at(-1).opcoes, ['dor']);
    const summary = (await call(scopePath() + '/summary', 'GET', undefined, maria.headers)).body.data;
    assert.deepEqual(summary.lastWellbeing, { feeling: body.feeling, recordedAt: body.recordedAt });
    assert.equal((await call(scopePath('pac-001') + '/summary', 'GET', undefined, jose.headers)).body.data.lastWellbeing, undefined);
    assert.ok(p.pendencias.some((pe: any) => pe.tipo === 'checkin' && pe.falaLiteral === body.note));
    assert.ok(!state.pacientes.find((p: any) => p.id === 'pac-001').checkins.some((c: any) => c.id === result.body.data.id));
    assert.equal((await call(scopePath() + '/wellbeing', 'POST', { ...body, recordedAt: '2026-02-30T12:00:00Z' }, { ...maria.headers, 'Idempotency-Key': body.idempotencyKey })).status, 400);
  });
  await t.test('request progresses only after actual Pro assume/complete, duplicates stay one', async () => {
    requestBody = { type: 'contact', idempotencyKey: 'contact-one', confirmation: confirmation() };
    const headers = { ...maria.headers, 'Idempotency-Key': requestBody.idempotencyKey };
    assert.equal((await call(scopePath() + '/requests', 'POST', requestBody, maria.headers)).status, 400);
    const result = await call(scopePath() + '/requests', 'POST', requestBody, headers);
    requestId = result.body.data.id;
    assert.equal(result.body.data.status, 'accepted');
    assert.equal((await call(scopePath() + '/requests', 'POST', requestBody, headers)).body.data.id, requestId);
    assert.equal((await call(scopePath() + '/requests', 'POST', { ...requestBody, type: 'reschedule', appointmentId: 'ag-m1' }, headers)).status, 409);
    await pro(`/api/pro/pendencias/${requestId}/assumir`);
    let requests = (await call(scopePath() + '/requests', 'GET', undefined, maria.headers)).body.data;
    assert.equal(requests.find((r: any) => r.id === requestId).status, 'in_progress');
    await pro(`/api/pro/pendencias/${requestId}/concluir`, { desfecho: 'contato_realizado' });
    requests = (await call(scopePath() + '/requests', 'GET', undefined, maria.headers)).body.data;
    assert.equal(requests.find((r: any) => r.id === requestId).status, 'completed');
    assert.equal((await call(scopePath() + '/requests', 'POST', requestBody, headers)).body.data.status, 'completed');
    assert.deepEqual((await call(scopePath('pac-001') + '/requests', 'GET', undefined, jose.headers)).body.data, []);
    const body = { type: 'reschedule', appointmentId: 'ag-m1', idempotencyKey: 'reschedule-one', confirmation: confirmation() };
    const before = (await call(scopePath() + '/appointments', 'GET', undefined, maria.headers)).body.data;
    await call(scopePath() + '/requests', 'POST', body, { ...maria.headers, 'Idempotency-Key': body.idempotencyKey });
    assert.deepEqual((await call(scopePath() + '/appointments', 'GET', undefined, maria.headers)).body.data, before);
  });
  await t.test('message limits align with mobile and invalid team messages do not append or claim a conversation', async () => {
    const patientBefore = (await call('/api/pro/estado', 'GET', undefined, teamHeaders)).body.pacientes.find((p: any) => p.id === 'pac-001');
    assert.equal(patientBefore.modoConversa, 'lia');
    for (const texto of ['x'.repeat(4001), 'invalid\u0001message']) {
      assert.equal((await pro('/api/pro/pacientes/pac-001/mensagens', { texto })).status, 400);
      const patientAfter = (await call('/api/pro/estado', 'GET', undefined, teamHeaders)).body.pacientes.find((p: any) => p.id === 'pac-001');
      assert.deepEqual(patientAfter.mensagens, patientBefore.mensagens);
      assert.equal(patientAfter.modoConversa, patientBefore.modoConversa);
      assert.equal(patientAfter.profissionalResponsavel, patientBefore.profissionalResponsavel);
      assert.equal(patientAfter.ultimaAtividadeProfissional, patientBefore.ultimaAtividadeProfissional);
    }
    for (const length of [2001, 4000]) {
      const body = { text: 'x'.repeat(length), source: 'text', idempotencyKey: `message-length-${length}`, confirmation: confirmation() };
      const result = await call(scopePath() + '/messages', 'POST', body, { ...maria.headers, 'Idempotency-Key': body.idempotencyKey });
      assert.equal(result.status, 200); assert.equal(result.body.data.text, body.text);
    }
    const tooLong = { text: 'x'.repeat(4001), source: 'text', idempotencyKey: 'message-length-4001', confirmation: confirmation() };
    assert.equal((await call(scopePath() + '/messages', 'POST', tooLong, { ...maria.headers, 'Idempotency-Key': tooLong.idempotencyKey })).status, 400);
  });
  await t.test('legacy oversized visible messages become bounded notices and retain the full original only in Pro', async () => {
    const original = 'LEGACY_FICTIONAL_ORIGINAL_' + 'x'.repeat(4100);
    const p = obterPaciente('pac-maria');
    const legacy = adicionarMensagem(p, { autor: 'profissional', nomeAutor: 'Fictional team', texto: original, visivelPaciente: true });
    const internal = adicionarMensagem(p, { autor: 'sistema', nomeAutor: 'System', texto: 'INTERNAL_LEGACY_HYPOTHESIS_' + 'y'.repeat(4100), sistema: true, tipoSistema: 'hipotese', visivelPaciente: false });
    const result = await call(scopePath() + '/messages', 'GET', undefined, maria.headers);
    assert.equal(result.status, 200);
    const notice = result.body.data.find((m: any) => m.id === legacy.id);
    assert.equal(notice.role, 'system'); assert.equal(notice.authorLabel, 'OncoFlow');
    assert.ok(notice.text.length <= 4000); assert.ok(notice.text.includes('conteúdo original permanece disponível para a equipe'));
    assert.ok(!JSON.stringify(result.body).includes('LEGACY_FICTIONAL_ORIGINAL_'));
    assert.ok(!JSON.stringify(result.body).includes('INTERNAL_LEGACY_HYPOTHESIS_'));
    assert.ok(!result.body.data.some((m: any) => m.id === internal.id));
    const teamPatient = (await call('/api/pro/estado', 'GET', undefined, teamHeaders)).body.pacientes.find((p: any) => p.id === 'pac-maria');
    assert.equal(teamPatient.mensagens.find((m: any) => m.id === legacy.id).texto, original);
  });
  await t.test('mobile messages reach Pro without another Lia and replies return, internal hypotheses stay private', async () => {
    const body = { text: 'Fictional message: fever mentioned for review.', source: 'voice', idempotencyKey: 'message-one', confirmation: confirmation() };
    const headers = { ...maria.headers, 'Idempotency-Key': body.idempotencyKey };
    const result = await call(scopePath() + '/messages', 'POST', body, headers);
    messageId = result.body.data.id;
    assert.equal(result.body.resourceType, 'message'); assert.equal(result.body.data.role, 'patient');
    assert.equal((await call(scopePath() + '/messages', 'POST', body, headers)).body.data.id, messageId);
    await pro('/api/pro/pacientes/pac-maria/mensagens', { texto: 'Fictional team reply in the shared demo.' });
    const messages = (await call(scopePath() + '/messages', 'GET', undefined, maria.headers)).body.data;
    assert.equal(messages.filter((m: any) => m.id === messageId).length, 1);
    assert.ok(messages.some((m: any) => m.role === 'team' && m.text.includes('Fictional team reply')));
    assert.ok(!messages.some((m: any) => m.text.includes('hypothesis')));
    const p = (await call('/api/pro/estado', 'GET', undefined, teamHeaders)).body.pacientes.find((p: any) => p.id === 'pac-maria');
    assert.equal(p.mensagens.find((m: any) => m.id === messageId).origem, 'voz');
    assert.ok(p.mensagens.some((m: any) => m.visivelPaciente === false && m.tipoSistema === 'hipotese'));
    assert.equal(p.mensagens.filter((m: any) => m.autor === 'lia' && m.tipoSistema !== 'urgencia').length, 1);
    assert.ok(messages.some((m: any) => m.role === 'system' && m.text.includes('This channel is not for emergencies')));
    assert.ok(!(await call(scopePath('pac-001') + '/messages', 'GET', undefined, jose.headers)).body.data.some((m: any) => m.id === messageId));
  });
  await t.test('Portuguese mobile reports use service notice and an internal review hypothesis; simple denial does not', async () => {
    const before = (await call('/api/pro/estado', 'GET', undefined, teamHeaders)).body.pacientes.find((p: any) => p.id === 'pac-maria');
    const countBefore = before.pendencias.filter((pe: any) => pe.tipo === 'sinal_urgencia').length;
    const positive = { text: 'Estou com muita falta de ar agora.', source: 'text', idempotencyKey: 'pt-urgency-positive', confirmation: confirmation() };
    await call(scopePath() + '/messages', 'POST', positive, { ...maria.headers, 'Idempotency-Key': positive.idempotencyKey });
    await call(scopePath() + '/messages', 'POST', positive, { ...maria.headers, 'Idempotency-Key': positive.idempotencyKey });
    let p = (await call('/api/pro/estado', 'GET', undefined, teamHeaders)).body.pacientes.find((p: any) => p.id === 'pac-maria');
    assert.equal(p.pendencias.filter((pe: any) => pe.tipo === 'sinal_urgencia').length, countBefore + 1);
    const review = p.pendencias.find((pe: any) => pe.falaLiteral === positive.text);
    assert.equal(review.origem, 'hipotese_sistema'); assert.equal(review.estado, 'aberta');
    const hidden = p.mensagens.filter((m: any) => m.tipoSistema === 'hipotese').map((m: any) => m.id);
    const visible = (await call(scopePath() + '/messages', 'GET', undefined, maria.headers)).body.data;
    assert.ok(visible.some((m: any) => m.text === positive.text && m.role === 'patient'));
    assert.ok(visible.some((m: any) => m.role === 'system' && m.text.includes('This channel is not for emergencies')));
    assert.ok(!visible.some((m: any) => hidden.includes(m.id)));
    const denied = { text: 'Não tenho falta de ar. Estou sem febre e não sinto dor no peito.', source: 'text', idempotencyKey: 'pt-urgency-negated', confirmation: confirmation() };
    await call(scopePath() + '/messages', 'POST', denied, { ...maria.headers, 'Idempotency-Key': denied.idempotencyKey });
    p = (await call('/api/pro/estado', 'GET', undefined, teamHeaders)).body.pacientes.find((p: any) => p.id === 'pac-maria');
    assert.equal(p.pendencias.filter((pe: any) => pe.tipo === 'sinal_urgencia').length, countBefore + 1);
  });
  await t.test('Pro edits actual agenda/journey; documents require explicit publication and never expose internal plan', async () => {
    const agenda = { title: 'Fictional rescheduled visit', startsAt: '2026-12-01T15:00:00-03:00', locationLabel: 'Demo room 2', professionalLabel: 'Fictional team', preparation: 'Bring the fictional demo guide.', status: 'confirmed' };
    assert.equal((await pro('/api/pro/pacientes/pac-maria/agenda/ag-j1', agenda)).status, 404);
    assert.equal((await pro('/api/pro/pacientes/pac-maria/agenda/ag-m1', agenda)).status, 200);
    let appointments = (await call(scopePath() + '/appointments', 'GET', undefined, maria.headers)).body.data;
    assert.equal(appointments.find((a: any) => a.id === 'ag-m1').startsAt, agenda.startsAt);
    assert.equal(appointments.find((a: any) => a.id === 'ag-m1').preparation, agenda.preparation);
    await pro('/api/pro/pacientes/pac-maria/agenda/ag-m1', { ...agenda, preparation: '' });
    appointments = (await call(scopePath() + '/appointments', 'GET', undefined, maria.headers)).body.data;
    assert.equal(appointments.find((a: any) => a.id === 'ag-m1').preparation, undefined);
    assert.equal((await pro('/api/pro/pacientes/pac-maria/journey/et-m2', { title: 'Fictional completed stage', description: 'Approved demonstration update.', occurredAt: timestamp(), status: 'completed' })).status, 200);
    assert.equal((await call(scopePath() + '/journey', 'GET', undefined, maria.headers)).body.data.find((j: any) => j.id === 'et-m2').status, 'completed');
    const document = { title: 'Fictional approved guide', issuedAt: timestamp(), typeLabel: 'Orientação', body: ['Only explicitly approved patient text.'], publish: false };
    assert.equal((await pro('/api/pro/pacientes/pac-maria/documents', { ...document, publish: undefined })).status, 400);
    const draft = await pro('/api/pro/pacientes/pac-maria/documents', document);
    documentId = draft.body.resource.id;
    assert.ok(!(await call(scopePath() + '/documents', 'GET', undefined, maria.headers)).body.data.some((d: any) => d.id === documentId));
    assert.equal((await pro(`/api/pro/pacientes/pac-001/documents/${documentId}/publish`, { publish: true })).status, 404);
    assert.equal((await pro(`/api/pro/pacientes/pac-maria/documents/${documentId}/publish`, { publish: true })).status, 200);
    assert.ok((await call(scopePath() + '/documents', 'GET', undefined, maria.headers)).body.data.some((d: any) => d.id === documentId));
    await pro('/api/pro/pacientes/pac-maria/plano', { texto: 'SECRET INTERNAL FICTIONAL PLAN', atualizadoEm: timestamp() });
    assert.ok(!JSON.stringify((await call(scopePath() + '/documents', 'GET', undefined, maria.headers)).body).includes('SECRET INTERNAL'));
    assert.ok(!(await call(scopePath('pac-001') + '/documents', 'GET', undefined, jose.headers)).body.data.some((d: any) => d.id === documentId));
  });
  await t.test('preferences use scoped idempotent writes; CORS permits only configured native origins', async () => {
    const body = { locale: 'en-US', explanation: 'step_by_step', speechRate: 0.8, textScale: 1.5, idempotencyKey: 'preferences-one' };
    assert.equal((await call(scopePath() + '/preferences', 'PUT', body, { ...maria.headers, 'Idempotency-Key': body.idempotencyKey })).status, 200);
    assert.equal((await call(scopePath() + '/preferences', 'GET', undefined, maria.headers)).body.data.locale, 'en-US');
    assert.equal((await call(scopePath() + '/summary', 'GET', undefined, maria.headers)).body.data.lastWellbeing.feeling, 'Com dor');
    const newer = { ...body, explanation: 'short', idempotencyKey: 'preferences-two' };
    await call(scopePath() + '/preferences', 'PUT', newer, { ...maria.headers, 'Idempotency-Key': newer.idempotencyKey });
    const replay = await call(scopePath() + '/preferences', 'PUT', body, { ...maria.headers, 'Idempotency-Key': body.idempotencyKey });
    assert.equal(replay.body.data.explanation, 'step_by_step');
    assert.equal((await call(scopePath() + '/preferences', 'GET', undefined, maria.headers)).body.data.explanation, 'short');
    assert.equal((await call(scopePath('pac-001') + '/preferences', 'GET', undefined, jose.headers)).body.data.locale, 'pt-BR');
    const native = await fetch(origin + scopePath() + '/preferences', { method: 'OPTIONS', headers: { Origin: 'https://localhost' } });
    assert.equal(native.status, 204); assert.equal(native.headers.get('Access-Control-Allow-Origin'), 'https://localhost');
    assert.equal((await fetch(origin + scopePath() + '/preferences', { method: 'OPTIONS', headers: { Origin: 'https://unapproved.example' } })).status, 403);
  });
  await t.test('saved state/idempotency survives new server; sessions are memory only and reset revokes everything', async () => {
    const saved = readFileSync(statePath, 'utf8');
    assert.ok(!saved.includes(maria.token)); assert.ok(!saved.includes(maria.code));
    const old = maria;
    await stop(); resetar(); await start();
    assert.equal((await call(scopePath() + '/summary', 'GET', undefined, old.headers)).status, 401);
    maria = await pair();
    const result = await call(scopePath() + '/requests', 'POST', requestBody, { ...maria.headers, 'Idempotency-Key': requestBody.idempotencyKey });
    assert.equal(result.status, 200); assert.equal(result.body.data.id, requestId); assert.equal(result.body.data.status, 'completed');
    const state = (await call('/api/pro/estado', 'GET', undefined, teamHeaders)).body;
    assert.equal(state.pacientes.find((p: any) => p.id === 'pac-maria').pendencias.filter((p: any) => p.id === requestId).length, 1);
    assert.ok((await call(scopePath() + '/documents', 'GET', undefined, maria.headers)).body.data.some((d: any) => d.id === documentId));
    assert.ok((await call(scopePath() + '/messages', 'GET', undefined, maria.headers)).body.data.some((m: any) => m.id === messageId));
    assert.equal((await call(scopePath() + '/preferences', 'GET', undefined, maria.headers)).body.data.locale, 'en-US');
    assert.equal((await call(scopePath() + '/summary', 'GET', undefined, maria.headers)).body.data.lastWellbeing.feeling, 'Com dor');
    const pendingPair = await pro('/api/pro/pacientes/pac-maria/mobile-pairing');
    await call('/api/demo/reset', 'POST', {});
    assert.equal((await call(scopePath() + '/summary', 'GET', undefined, maria.headers)).status, 401);
    assert.equal((await call('/api/mobile/pair', 'POST', { code: pendingPair.body.code })).status, 401);
    maria = await pair();
    assert.deepEqual((await call(scopePath() + '/requests', 'GET', undefined, maria.headers)).body.data, []);
    assert.equal((await call(scopePath() + '/summary', 'GET', undefined, maria.headers)).body.data.lastWellbeing, undefined);
    clock += 60_001;
    assert.equal((await call(scopePath() + '/summary', 'GET', undefined, maria.headers)).status, 401);
  });
});

test('pair attempt map is rate bounded over the actual API', async () => {
  resetar(); const api = criarApi({ statePath: null });
  const server = await new Promise<Server>(resolve => { const s = api.app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    for (let i = 0; i < 21; i++) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/mobile/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'INVALID' }) });
      assert.equal(response.status, i < 20 ? 401 : 429);
    }
  } finally { api.dispose(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('automatic symptom report is scoped, affirmative, atomic, durable and idempotent over HTTP', async t => {
  const testsRoot = path.resolve('outputs/.oncoflow-demo/tests'); mkdirSync(testsRoot, { recursive: true });
  const folder = mkdtempSync(path.join(testsRoot, 'symptom-')); const statePath = path.join(folder, 'state.json');
  let failSave = false; let api: ReturnType<typeof criarApi>; let server: Server; let origin: string;
  async function start() {
    api = criarApi({ statePath, beforePersist: () => { if (failSave) throw new Error('Injected persistence failure'); } });
    await new Promise<void>(resolve => { server = api.app.listen(0, '127.0.0.1', resolve); });
    const address = server.address(); assert.ok(address && typeof address !== 'string'); origin = `http://127.0.0.1:${address.port}`;
  }
  async function stop() { api.dispose(); await new Promise<void>(resolve => server.close(() => resolve())); }
  async function call(url: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(origin + url, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  async function pair(patientId: string) {
    const code = (await call(`/api/pro/pacientes/${patientId}/mobile-pairing`, 'POST', {}, teamHeaders)).body.code;
    const result = await call('/api/mobile/pair', 'POST', { code }); assert.equal(result.status, 200);
    return { Authorization: `Bearer ${result.body.accessToken}` };
  }
  const proPatient = async (patientId = 'pac-maria') => (await call('/api/pro/estado', 'GET', undefined, teamHeaders)).body.pacientes.find((p: any) => p.id === patientId);
  resetar(); await start();
  t.after(async () => { failSave = false; await stop(); assert.ok(folder.startsWith(testsRoot + path.sep)); rmSync(folder, { recursive: true, force: true }); });
  let auth = await pair('pac-maria'); const jose = await pair('pac-001');
  const reports: any[] = [];
  await t.test('PT/EN affirmative fever/vomiting in text/voice need no extra confirmation and create exactly one shared review item', async () => {
    for (const [index, text] of ['Estou vomitando e com febre agora.', 'Estou com febre e vômitos persistentes.', 'Não consigo parar de vomitar.', 'I have a fever and I am vomiting now.', 'O que fazer se tiver febre? Estou vomitando agora.', 'Tive febre ontem, hoje estou vomitando.', 'Tive febre ontem e hoje estou vomitando.', 'What should I do if I get fever? I am vomiting now.', 'I had a fever yesterday, and now I am vomiting.'].entries()) {
      const source = index % 2 ? 'voice' : 'text'; const locale = index === 3 ? 'en-US' : 'pt-BR';
      const body = { text, source, locale, idempotencyKey: `auto-report-${index}` }; const headers = { ...auth, 'Idempotency-Key': body.idempotencyKey };
      const before = await proPatient(); const result = await call(scopePath() + '/symptom-reports', 'POST', body, headers);
      assert.equal(result.status, 200); assert.equal(result.body.resourceType, 'symptom_report');
      const record = result.body.data; reports.push({ body, record });
      assert.deepEqual(Object.keys(record).sort(), ['tenantId', 'hospitalId', 'patientId', 'id', 'text', 'source', 'recordedAt', 'status', 'alertId', 'reviewRequired', 'guidance'].sort());
      assert.equal(record.text, text); assert.equal(record.source, source); assert.equal(record.status, 'recorded'); assert.equal(record.reviewRequired, true);
      assert.ok(record.guidance.includes(locale === 'pt-BR' ? 'avaliação agora' : 'assessment now'));
      assert.ok(record.guidance.includes(locale === 'pt-BR' ? 'Não espere' : 'Do not wait'));
      assert.deepEqual((await call(scopePath() + '/symptom-reports', 'POST', body, headers)).body.data, record);
      const after = await proPatient(); assert.equal(after.pendencias.length, before.pendencias.length + 1);
      const alert = after.pendencias.find((pe: any) => pe.id === record.alertId);
      assert.equal(alert.falaLiteral, text); assert.equal(alert.origem, 'hipotese_sistema'); assert.equal(alert.estado, 'aberta'); assert.equal(alert.papelDestino, 'enfermagem');
      assert.equal(after.mensagens.filter((m: any) => m.autor === 'paciente' && m.texto === text).length, 1);
      assert.ok(!(await proPatient('pac-001')).pendencias.some((pe: any) => pe.id === record.alertId));
      const visible = (await call(scopePath() + '/messages', 'GET', undefined, auth)).body.data;
      const internalIds = after.mensagens.filter((m: any) => !m.visivelPaciente).map((m: any) => m.id);
      assert.ok(!visible.some((m: any) => internalIds.includes(m.id)));
      assert.equal((await call(scopePath('pac-001') + '/symptom-reports', 'POST', body, headers)).status, 403);
      assert.equal((await call(scopePath() + '/symptom-reports', 'POST', { ...body, text: text + ' changed' }, headers)).status, 409);
    }
  });
  await t.test('educational questions, hypothetical, historical, third party and negated mentions create no clinical records', async () => {
    const before = await proPatient();
    const diskBefore = readFileSync(statePath, 'utf8');
    const negatives = ['Olá, quando é minha consulta?', 'O que é febre?', 'O que devo fazer se eu tiver febre e vômitos?', 'Se eu estiver vomitando, o que faço?', 'E se eu tiver febre?', 'Talvez eu tenha febre amanhã.', 'Estou sem febre e não estou vomitando.', 'Não tenho febre nem vômitos.', 'Não sinto febre.', 'Tive febre ontem, hoje estou bem.', 'Ontem eu estava vomitando.', 'Minha mãe está com febre e vômitos.', 'Meu filho está vomitando.', 'Ela está com febre.', 'I do not have a fever.', "I'm not vomiting.", 'What is fever?', 'If I have a fever, what should I do?', 'I had a fever yesterday.', 'My mother has a fever.', 'She is vomiting.', 'Can chemotherapy cause vomiting?', 'Tenho uma dúvida sobre febre.', 'Tenho medo de vomitar.', 'If I have a fever and I am vomiting, what should I do?', 'Febre?', 'Vômitos?'];
    for (const [index, text] of negatives.entries()) {
      const body = { text, source: 'text', locale: 'pt-BR', idempotencyKey: `auto-no-${index}` };
      const result = await call(scopePath() + '/symptom-reports', 'POST', body, { ...auth, 'Idempotency-Key': body.idempotencyKey });
      assert.equal(result.status, 200, text); assert.deepEqual(result.body.data, { tenantId: 'demo', hospitalId: 'oncoflow', patientId: 'pac-maria', status: 'not_applicable' }, text);
    }
    const after = await proPatient(); assert.deepEqual(after.pendencias, before.pendencias); assert.deepEqual(after.mensagens, before.mensagens);
    assert.equal(readFileSync(statePath, 'utf8'), diskBefore);
    const disk = JSON.parse(readFileSync(statePath, 'utf8')); assert.ok(!Object.keys(disk.extras.idempotency).some(key => key.includes('auto-no-')));
  });
  await t.test('registry context is explicit and scoped; internal plan and draft documents never enter summary', async () => {
    const p = obterPaciente('pac-maria'); p.planoTerapeuticoTexto = 'PRIVATE_PLAN_DO_NOT_EXPOSE';
    const draft = await call('/api/pro/pacientes/pac-maria/documents', 'POST', { title: 'Internal draft', issuedAt: timestamp(), typeLabel: 'Orientação', body: ['PRIVATE_DRAFT_DO_NOT_EXPOSE'], publish: false }, teamHeaders); assert.equal(draft.status, 200);
    const summary = (await call(scopePath() + '/summary', 'GET', undefined, auth)).body.data;
    assert.equal(summary.careContext.diagnosisLabel, p.diagnosticoResumido); assert.equal(summary.careContext.treatmentLabel, p.esquemaResumido); assert.equal(summary.careContext.cycleLabel, p.cicloAtual);
    assert.deepEqual(Object.keys(summary.careContext).sort(), ['diagnosisLabel', 'treatmentLabel', 'cycleLabel', 'sourceLabel', 'patientInstructions'].sort());
    assert.ok(summary.careContext.patientInstructions.includes(p.documentos.find(d => d.tipo === 'orientacao')!.texto));
    assert.ok(!JSON.stringify(summary).includes('PRIVATE_'));
    assert.notEqual((await call(scopePath('pac-001') + '/summary', 'GET', undefined, jose)).body.data.careContext.diagnosisLabel, summary.careContext.diagnosisLabel);
  });
  await t.test('persistence failure rolls back message, alert and operation before any acknowledgment; retry succeeds once', async () => {
    const before = await proPatient(); const body = { text: 'Estou com febre agora.', source: 'voice', locale: 'pt-BR', idempotencyKey: 'auto-failed-save' }; const headers = { ...auth, 'Idempotency-Key': body.idempotencyKey };
    failSave = true; assert.equal((await call(scopePath() + '/symptom-reports', 'POST', body, headers)).status, 500); failSave = false;
    const after = await proPatient(); assert.deepEqual(after.mensagens, before.mensagens); assert.deepEqual(after.pendencias, before.pendencias);
    assert.ok(!readFileSync(statePath, 'utf8').includes('auto-failed-save'));
    const result = await call(scopePath() + '/symptom-reports', 'POST', body, headers); assert.equal(result.status, 200); reports.push({ body, record: result.body.data });
    assert.equal((await proPatient()).pendencias.length, before.pendencias.length + 1);
    assert.equal((await call(scopePath() + '/symptom-reports', 'POST', { ...body, confirmation: confirmation() }, headers)).status, 400);
    assert.equal((await call(scopePath() + '/symptom-reports', 'POST', { ...body, text: 'x'.repeat(4001) }, headers)).status, 400);
    assert.equal((await call(scopePath() + '/symptom-reports', 'POST', body, auth)).status, 400);
  });
  await t.test('reports and idempotency survive a fresh server instance and remain isolated', async () => {
    await stop(); resetar(); await start(); auth = await pair('pac-maria');
    for (const { body, record } of reports) {
      const result = await call(scopePath() + '/symptom-reports', 'POST', body, { ...auth, 'Idempotency-Key': body.idempotencyKey });
      assert.equal(result.status, 200); assert.deepEqual(result.body.data, record);
      assert.equal((await proPatient()).pendencias.filter((pe: any) => pe.id === record.alertId).length, 1);
    }
  });
});
