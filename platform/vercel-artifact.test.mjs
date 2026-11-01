/** Tests the deployable output, rather than the development server that used to mask a missing API. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInside } from './process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.vercel/output');
const functionDirectory = path.join(output, 'functions/api/index.func');

test('production Build Output contains both the public Pro and a Node API function', async () => {
  assert.equal(JSON.parse(await readFile(path.join(output, 'config.json'), 'utf8')).version, 3);
  const config = JSON.parse(await readFile(path.join(functionDirectory, '.vc-config.json'), 'utf8'));
  assert.equal(config.runtime, 'nodejs24.x'); assert.equal(config.handler, 'index.cjs');
  assert.equal(config.launcherType, 'Nodejs'); assert.equal(config.maxDuration, 60);
  assert.ok((await readFile(path.join(functionDirectory, config.handler))).length > 1000);
  assert.match(await readFile(path.join(output, 'static/index.html'), 'utf8'), /OncoFlow/);
  for (const privatePath of ['static/server.cjs', 'static/server.cjs.map', 'static/api/index.cjs', 'static/.env']) {
    await assert.rejects(readFile(path.join(output, privatePath)), { code: 'ENOENT' });
  }
  assert.deepEqual((await readdir(functionDirectory)).sort(), ['.vc-config.json', 'index.cjs']);
});

test('compiled API boots without repository node_modules and returns JSON 503 without Redis instead of a platform 404', async () => {
  const temporaryRoot = path.resolve(tmpdir());
  const folder = await mkdtemp(path.join(temporaryRoot, 'oncoflow-api-artifact-')); assertInside(temporaryRoot, folder);
  const keys = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  let server;
  try {
    await cp(functionDirectory, folder, { recursive: true });
    for (const key of keys) delete process.env[key];
    const compiled = createRequire(import.meta.url)(path.join(folder, 'index.cjs'));
    const handler = compiled.default ?? compiled; assert.equal(typeof handler, 'function');
    server = createServer((req, res) => { Promise.resolve(handler(req, res)).catch(() => { res.statusCode = 500; res.end(); }); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 503); assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    assert.equal((await response.json()).erro, 'persistencia_indisponivel');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    for (const [key, value] of previous) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    assertInside(temporaryRoot, folder); await rm(folder, { recursive: true, force: true });
  }
});
