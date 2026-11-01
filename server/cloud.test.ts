/** Real Node HTTP -> Express -> actual Upstash SDK -> isolated Redis REST protocol emulator.
 * No cloud credentials, deployed resources or real patient data are used by this suite.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, request, type Server } from 'node:http';
import { Redis } from '@upstash/redis';
import { COMMIT_SCRIPT, RELEASE_SCRIPT, criarCloudHandler, createRedisStore, redisStoreFromEnv } from './cloud';

const team = { 'x-demo-usuario': 'usr-rodrigo' };
const patientPath = (id = 'pac-maria') => `/api/v1/tenants/demo/hospitals/oncoflow/patients/${id}`;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) { await new Promise<void>(resolve => server.close(() => resolve())); }
async function protocolRedis() {
  const values = new Map<string, { value: string; expires?: number }>();
  let failRead = false, failCommit = false, loseCommitReply = false, expireCommit = false;
  let commitGate: Promise<void> | null = null;
  let commands = 0;
  const get = (key: string) => { const item = values.get(key); if (item?.expires && item.expires <= Date.now()) { values.delete(key); return null; } return item?.value ?? null; };
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.headers.authorization, 'Bearer local-protocol-fixture');
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const command = JSON.parse(Buffer.concat(chunks).toString()); commands++;
      let result: unknown;
      if (command[0] === 'set') {
        const [, key, value, ...options] = command;
        assert.ok(options.includes('nx')); assert.ok(options.includes('px'));
        result = get(key) !== null ? null : 'OK';
        if (result) values.set(key, { value, expires: Date.now() + Number(options[options.indexOf('px') + 1]) });
      } else if (command[0] === 'get') {
        if (failRead) throw new Error('injected read failure'); result = get(command[1]);
      } else if (command[0] === 'eval') {
        const [, script, count, ...rest] = command; const keys = rest.slice(0, count), args = rest.slice(count);
        assert.ok(script === COMMIT_SCRIPT || script === RELEASE_SCRIPT);
        if (script === COMMIT_SCRIPT) {
          if (commitGate) await commitGate;
          if (failCommit) throw new Error('injected commit failure');
          if (expireCommit) { expireCommit = false; values.set(keys[0], { value: 'newer-owner', expires: Date.now() + 10000 }); }
          result = get(keys[0]) === args[0] ? 1 : 0;
          if (result) { values.set(keys[1], { value: args[1] }); values.delete(keys[0]); }
          if (loseCommitReply) { loseCommitReply = false; throw new Error('injected lost reply after commit'); }
        } else { result = get(keys[0]) === args[0] ? 1 : 0; if (result) values.delete(keys[0]); }
      } else throw new Error('unexpected Redis command');
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ result }));
    } catch { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'fixture unavailable' })); }
  });
  const origin = await listen(server);
  const sdk = new Redis({ url: origin, token: 'local-protocol-fixture', retry: false, enableAutoPipelining: false, automaticDeserialization: false });
  const namespace = 'test:oncoflow';
  return {
    store: createRedisStore(sdk, namespace), server, values,
    get commands() { return commands; },
    set failRead(value: boolean) { failRead = value; }, set failCommit(value: boolean) { failCommit = value; },
    set loseCommitReply(value: boolean) { loseCommitReply = value; }, set expireCommit(value: boolean) { expireCommit = value; },
    set commitGate(value: Promise<void> | null) { commitGate = value; },
    snapshot: () => { const raw = get(namespace + ':snapshot'); return raw ? JSON.parse(raw) : null; },
    lock: () => get(namespace + ':lock'),
    clearLock: () => values.delete(namespace + ':lock'),
    holdLock: () => values.set(namespace + ':lock', { value: 'external-worker', expires: Date.now() + 10000 }),
  };
}
async function apiServer(store: ReturnType<typeof createRedisStore>, autoConnect = true, waitMs = 500) {
  const server = createServer(criarCloudHandler({ store, autoConnect, waitMs }));
  return { server, origin: await listen(server) };
}
async function call(origin: string, path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}, rewritten = true) {
  const route = rewritten ? '/api/index?__oncoflow_path=' + encodeURIComponent(path) : path;
  const response = await fetch(origin + route, { method, headers: { Host: 'fixture-oncoflow.vercel.app', ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function session(origin: string, patientId = 'pac-maria') {
  const result = await call(origin, '/api/mobile/demo-session', 'POST', { patientId }); assert.equal(result.status, 200);
  return { result: result.data, headers: { Authorization: `Bearer ${result.data.accessToken}` } };
}

test('cloud entrypoint fails closed without Redis configuration; env aliases and canonical URLs are validated', async () => {
  assert.throws(() => redisStoreFromEnv({}), /unavailable/);
  assert.throws(() => redisStoreFromEnv({ UPSTASH_REDIS_REST_URL: 'https://db.example', KV_REST_API_TOKEN: 'partial' }), /unavailable/);
  assert.throws(() => redisStoreFromEnv({ UPSTASH_REDIS_REST_URL: 'http://db.example', UPSTASH_REDIS_REST_TOKEN: 'fixture' }), /unavailable/);
  assert.doesNotThrow(() => redisStoreFromEnv({ KV_REST_API_URL: 'https://db.example', KV_REST_API_TOKEN: 'fixture' }));
  const server = createServer(criarCloudHandler({ storeFactory: () => redisStoreFromEnv({}) })); const origin = await listen(server);
  try { for (const path of ['/api/health', '/api/mobile/config', '/api/mobile/demo-session']) assert.equal((await call(origin, path)).status, 503); }
  finally { await close(server); }
});

test('actual SDK REST snapshot transactions retain scopes, credentials, proposals and idempotency across cold handler instances', async t => {
  const previousCanonical = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'fixture-oncoflow.vercel.app';
  t.after(() => { if (previousCanonical === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL; else process.env.VERCEL_PROJECT_PRODUCTION_URL = previousCanonical; });
  const redis = await protocolRedis(); const first = await apiServer(redis.store); const second = await apiServer(redis.store); const disabled = await apiServer(redis.store, false);
  t.after(async () => { await Promise.all([close(first.server), close(second.server), close(disabled.server)]); await close(redis.server); });
  let maria: Awaited<ReturnType<typeof session>>; let jose: Awaited<ReturnType<typeof session>>;
  await t.test('health and explicit rewrites preserve API paths and allowed native CORS', async () => {
    const health = await call(first.origin, '/api/health', 'GET', undefined, { Origin: 'https://localhost' });
    assert.equal(health.status, 200); assert.equal(health.data.storage, 'redis'); assert.equal(health.headers.get('access-control-allow-origin'), 'https://localhost');
    assert.equal((await call(first.origin, '/api')).status, 404);
    const config = await call(first.origin, '/api/mobile/config'); assert.equal(config.status, 200, JSON.stringify(config.data));
    assert.deepEqual(config.data, { apiVersion: '1', demo: true, autoConnectEnabled: true, serviceUrl: 'https://fixture-oncoflow.vercel.app', defaultPatientId: 'pac-maria' });
  });
  await t.test('flag gates auto login and patient listing; sessions use the requested fictional registry patient', async () => {
    assert.equal((await call(disabled.origin, '/api/mobile/config')).data.autoConnectEnabled, false);
    assert.equal((await call(disabled.origin, '/api/mobile/demo-patients')).status, 403);
    assert.equal((await call(disabled.origin, '/api/mobile/demo-session', 'POST', { patientId: 'pac-maria' })).status, 403);
    const listed = await call(first.origin, '/api/mobile/demo-patients'); assert.equal(listed.data.patients.length, 4);
    assert.ok(listed.data.patients.some((p: any) => p.id === 'pac-maria'));
    assert.equal((await call(first.origin, '/api/mobile/demo-session', 'POST', { patientId: 'made-up' })).status, 404);
    maria = await session(first.origin); jose = await session(second.origin, 'pac-001');
    assert.equal(maria.result.patient.displayName, 'Maria Oliveira Costa');
    assert.equal(jose.result.scope.patientId, 'pac-001');
    assert.equal((await call(second.origin, patientPath() + '/summary', 'GET', undefined, maria.headers)).status, 200);
    assert.equal((await call(first.origin, patientPath('pac-001') + '/summary', 'GET', undefined, maria.headers)).status, 403);
    assert.ok(!JSON.stringify(redis.snapshot()).includes(maria.result.accessToken));
    assert.ok(redis.snapshot().sessions.every(([key]: [string]) => /^[a-f0-9]{64}$/.test(key)));
  });
  await t.test('simultaneous requests through separate handlers do not lose shared writes and duplicate keys stay once', async () => {
    const body = { type: 'contact', idempotencyKey: 'concurrent-request', confirmation: { confirmed: true, confirmedAt: new Date().toISOString() } };
    const requests = await Promise.all([first.origin, second.origin, first.origin, second.origin].map(origin => call(origin, patientPath() + '/requests', 'POST', body, { ...maria.headers, 'Idempotency-Key': body.idempotencyKey })));
    requests.forEach(response => assert.equal(response.status, 200)); assert.equal(new Set(requests.map(response => response.data.data.id)).size, 1);
    const messages = await Promise.all(Array.from({ length: 8 }, (_, i) => {
      const message = { text: `Fictional concurrent text ${i}`, source: 'text', idempotencyKey: `parallel-message-${i}`, confirmation: body.confirmation };
      return call(i % 2 ? first.origin : second.origin, patientPath() + '/messages', 'POST', message, { ...maria.headers, 'Idempotency-Key': message.idempotencyKey });
    })); messages.forEach(response => assert.equal(response.status, 200));
    const result = await call(second.origin, patientPath() + '/messages', 'GET', undefined, maria.headers);
    assert.equal(result.data.data.filter((m: any) => m.text.startsWith('Fictional concurrent text')).length, 8);
    assert.equal((await call(first.origin, patientPath('pac-001') + '/requests', 'GET', undefined, jose.headers)).data.data.length, 0);
  });
  await t.test('legacy single-use pairing and pending confirmation proposals survive another handler', async () => {
    const pairing = await call(first.origin, '/api/pro/pacientes/pac-003/mobile-pairing', 'POST', {}, team);
    assert.equal(pairing.status, 200);
    const paired = await call(second.origin, '/api/mobile/pair', 'POST', { code: pairing.data.code }); assert.equal(paired.status, 200); assert.equal(paired.data.scope.patientId, 'pac-003');
    assert.equal((await call(first.origin, '/api/mobile/pair', 'POST', { code: pairing.data.code })).status, 401);
    const proposal = await call(first.origin, '/api/paciente/conversa', 'POST', { texto: 'I need to reschedule my appointment', origem: 'texto' }, { Authorization: 'Bearer demo-maria' });
    assert.ok(proposal.data.proposta?.token);
    const confirmed = await call(second.origin, '/api/paciente/conversa/confirmar', 'POST', { token: proposal.data.proposta.token, aceitar: true }, { Authorization: 'Bearer demo-maria' }); assert.equal(confirmed.status, 200);
    assert.ok(confirmed.data.solicitacoes.length > 0);
  });
  await t.test('no success response leaves the process before the atomic Redis commit completes', async () => {
    let release!: () => void; redis.commitGate = new Promise<void>(resolve => { release = resolve; });
    let answered = false; const pending = session(first.origin).then(result => { answered = true; return result; });
    await pause(30); assert.equal(answered, false); release(); redis.commitGate = null;
    assert.ok((await pending).result.accessToken);
  });
  await t.test('failed read/commit returns 503 and failed write cannot survive as in-memory-only success', async () => {
    redis.failRead = true; assert.equal((await call(second.origin, patientPath() + '/summary', 'GET', undefined, maria.headers)).status, 503); redis.failRead = false;
    const snapshotBefore = JSON.stringify(redis.snapshot());
    redis.failCommit = true;
    const failed = await call(first.origin, '/api/mobile/demo-session', 'POST', { patientId: 'pac-maria' });
    assert.equal(failed.status, 503); assert.equal(failed.data.accessToken, undefined); redis.failCommit = false;
    assert.equal(JSON.stringify(redis.snapshot()), snapshotBefore);
    assert.equal((await call(second.origin, patientPath() + '/summary', 'GET', undefined, maria.headers)).status, 200);
  });
  await t.test('lost acknowledgment after committed symptom report replays its same durable receipt without another alert', async () => {
    const body = { text: 'Estou vomitando e com febre agora.', source: 'voice', locale: 'pt-BR', idempotencyKey: 'lost-ack-report' }; const headers = { ...maria.headers, 'Idempotency-Key': body.idempotencyKey };
    redis.loseCommitReply = true;
    assert.equal((await call(first.origin, patientPath() + '/symptom-reports', 'POST', body, headers)).status, 503);
    const retried = await call(second.origin, patientPath() + '/symptom-reports', 'POST', body, headers); assert.equal(retried.status, 200);
    const matching = redis.snapshot().state.pendencias.filter((p: any) => p.id === retried.data.data.alertId); assert.equal(matching.length, 1);
    assert.equal(redis.snapshot().state.pacientes.find((p: any) => p.id === 'pac-maria').mensagens.filter((m: any) => m.autor === 'paciente' && m.texto === body.text).length, 1);
  });
  await t.test('an expired/replaced lease never overwrites a newer owner; lock contention is bounded', async () => {
    const before = JSON.stringify(redis.snapshot()); redis.expireCommit = true;
    assert.equal((await call(first.origin, '/api/mobile/demo-session', 'POST', { patientId: 'pac-maria' })).status, 503);
    assert.equal(JSON.stringify(redis.snapshot()), before); assert.equal(redis.lock(), 'newer-owner'); redis.clearLock();
    redis.holdLock(); const started = Date.now();
    assert.equal((await call(first.origin, '/api/health')).status, 503); assert.ok(Date.now() - started < 2000); redis.clearLock();
  });
  await t.test('slow bodies parse outside the shared mutex; rejected bodies never mutate state later', async () => {
    const before = JSON.stringify(redis.snapshot());
    const response = await new Promise<number>((resolve, reject) => {
      const req = request(first.origin + '/api/index?__oncoflow_path=/api/mobile/demo-session', { method: 'POST', headers: { Host: 'fixture-oncoflow.vercel.app', 'Content-Type': 'application/json' } }, res => { res.resume(); res.once('end', () => { req.end('"pac-maria"}'); resolve(res.statusCode!); }); });
      req.on('error', reject); req.write('{"patientId":');
    });
    assert.equal(response, 408); await pause(30); assert.equal(JSON.stringify(redis.snapshot()), before);
  });
  await t.test('explicit reset is durable and revokes every existing hash session', async () => {
    assert.equal((await call(first.origin, '/api/demo/reset', 'POST', {})).status, 200);
    assert.equal((await call(second.origin, patientPath() + '/summary', 'GET', undefined, maria.headers)).status, 401);
    assert.equal((await call(first.origin, patientPath('pac-001') + '/summary', 'GET', undefined, jose.headers)).status, 401);
    assert.equal(redis.snapshot().sessions.length, 0);
  });
  assert.ok(redis.commands > 50);
});

test('Vercel pre-parsed object, string, Buffer and throwing JSON getter are handled without reading a consumed stream', async t => {
  const redis = await protocolRedis(); const handler = criarCloudHandler({ store: redis.store, autoConnect: true });
  let getterReads = 0;
  const server = createServer((req, res) => {
    const fixture = req.headers['x-body-fixture'];
    const value = fixture === 'object' ? { patientId: 'pac-maria' } : fixture === 'string' ? '{"patientId":"pac-maria"}' : fixture === 'buffer' ? Buffer.from('{"patientId":"pac-maria"}') : undefined;
    if (fixture === 'throws') Object.defineProperty(req, 'body', { configurable: true, get() { getterReads++; throw new SyntaxError('fixture malformed JSON'); } });
    else if (fixture === 'getter') Object.defineProperty(req, 'body', { configurable: true, get() { getterReads++; return { patientId: 'pac-maria' }; } });
    else Object.defineProperty(req, 'body', { value, writable: true, configurable: true });
    void handler(req, res);
  });
  const origin = await listen(server); t.after(async () => { await close(server); await close(redis.server); });
  for (const fixture of ['object', 'string', 'buffer', 'getter']) {
    const response = await call(origin, '/api/mobile/demo-session', 'POST', undefined, { 'Content-Type': 'application/json', 'x-body-fixture': fixture });
    assert.equal(response.status, 200, fixture); assert.equal(response.data.scope.patientId, 'pac-maria');
  }
  assert.equal(getterReads, 1);
  assert.equal((await call(origin, '/api/mobile/demo-session', 'POST', undefined, { 'Content-Type': 'application/json', 'x-body-fixture': 'throws' })).status, 400);
  assert.equal(getterReads, 2);
  assert.equal((await call(origin, '/api/mobile/demo-session', 'POST', undefined, { 'Content-Type': 'application/x-www-form-urlencoded', 'x-body-fixture': 'throws' })).status, 415);
  assert.equal(getterReads, 2, 'invalid content type is rejected before evaluating the body getter');
});
