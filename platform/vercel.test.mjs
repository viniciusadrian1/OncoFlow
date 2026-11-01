import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticOutput, isPublicFrontendPath } from './static-output.mjs';
import { assertInside } from './process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('public output accepts frontend runtime assets and excludes server/source/credentials', () => {
  for (const relative of ['index.html', 'assets/index-a.js', 'app/index.html', 'app/assets/index-a.css',
    'app/brand/Manrope.ttf', 'app/vad/silero_vad_v5.onnx', 'app/vad/ort-wasm.wasm', 'app/vad/ort-wasm.mjs']) {
    assert.equal(isPublicFrontendPath(relative), true, relative);
  }
  for (const relative of ['server.cjs', 'server.cjs.map', 'app/server.cjs', 'app/assets/index.js.map', '.env',
    'app/.env.local', 'app/.source-manifest.json', 'app/android/BuildConfig.java', 'package-lock.json',
    'server/mobile.ts', '../index.html', 'app/../../outside.js', 'app\\index.html']) {
    assert.equal(isPublicFrontendPath(relative), false, relative);
  }
});

test('static assembly copies both apps while leaving backend bundle outside the public directory', async () => {
  const artifacts = path.join(root, 'test-results'); await mkdir(artifacts, { recursive: true });
  const fixture = await mkdtemp(path.join(artifacts, 'vercel-output-')); assertInside(artifacts, fixture);
  try {
    await mkdir(path.join(fixture, 'dist/app/assets'), { recursive: true });
    await writeFile(path.join(fixture, 'dist/index.html'), '<main>Pro fictício</main>');
    await writeFile(path.join(fixture, 'dist/app/index.html'), '<main>Paciente fictício</main>');
    await writeFile(path.join(fixture, 'dist/app/assets/client.js'), 'console.log("fictional frontend")');
    await writeFile(path.join(fixture, 'dist/server.cjs'), 'excluded server fixture');
    await writeFile(path.join(fixture, 'dist/server.cjs.map'), 'excluded source map fixture');
    const copied = await createStaticOutput(fixture);
    assert.deepEqual(copied.sort(), ['app/assets/client.js', 'app/index.html', 'index.html']);
    assert.equal(await readFile(path.join(fixture, 'dist-static/app/index.html'), 'utf8'), '<main>Paciente fictício</main>');
    await assert.rejects(readFile(path.join(fixture, 'dist-static/server.cjs')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(fixture, 'dist/server.cjs'), 'utf8'), 'excluded server fixture');
  } finally { assertInside(artifacts, fixture); await rm(fixture, { recursive: true, force: true }); }
});

test('the Pro service builds without the patient and does not publish an old copied patient build', async () => {
  const artifacts = path.join(root, 'test-results'); await mkdir(artifacts, { recursive: true });
  const fixture = await mkdtemp(path.join(artifacts, 'vercel-pro-')); assertInside(artifacts, fixture);
  try {
    await mkdir(path.join(fixture, 'dist'), { recursive: true });
    await writeFile(path.join(fixture, 'dist/index.html'), '<main>Pro fictício</main>');
    assert.deepEqual(await createStaticOutput(fixture, { includePatient: false }), ['index.html']);
    await mkdir(path.join(fixture, 'dist/app'), { recursive: true });
    await writeFile(path.join(fixture, 'dist/app/index.html'), '<main>Old patient build</main>');
    assert.deepEqual(await createStaticOutput(fixture, { includePatient: false }), ['index.html']);
    await assert.rejects(readFile(path.join(fixture, 'dist-static/app/index.html')), { code: 'ENOENT' });
  } finally { assertInside(artifacts, fixture); await rm(fixture, { recursive: true, force: true }); }
});

test('services own their build/runtime configuration and keep API and patient paths public on one domain', async () => {
  const config = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(config.services);
  for (const forbidden of ['framework', 'functions', 'buildCommand', 'installCommand', 'devCommand', 'ignoreCommand', 'outputDirectory']) assert.equal(forbidden in config, false, forbidden);
  assert.equal(pkg.engines.node, '24.x');
  const app = config.services.app, patient = config.services['patient-app'];
  assert.equal(app.root, '.'); assert.equal(app.framework, 'vite');
  assert.equal(app.outputDirectory, 'dist-static'); assert.ok(app.functions['api/index.ts']);
  assert.equal(patient.root, 'patient-app'); assert.equal(patient.framework, 'vite');
  assert.equal(patient.outputDirectory, 'dist-service');
  assert.ok(app.rewrites.some(route => route.destination === '/api/index?__oncoflow_path=/api/:path*'));
  const spaFallback = new RegExp(`^${app.rewrites.at(-1).source}$`);
  assert.equal(spaFallback.test('/api/index'), false, 'SPA fallback must not replace a resolved API route');
  assert.equal(spaFallback.test('/api/health'), false);
  assert.equal(spaFallback.test('/profile'), true);
  for (const asset of ['/assets/client.js', '/src/main.tsx', '/@vite/client', '/favicon.svg']) assert.equal(spaFallback.test(asset), false, asset);
  const patientFallback = new RegExp(`^${patient.rewrites.at(-1).source}$`);
  assert.equal(patientFallback.test('/app/journey'), true);
  for (const asset of ['/app/assets/client.js', '/app/@vite/client', '/app/src/main.tsx', '/app/vad/silero.onnx']) assert.equal(patientFallback.test(asset), false, asset);
  assert.ok(patient.rewrites.some(route => route.destination === '/app/index.html'));
  assert.deepEqual(config.rewrites.map(route => route.destination.service), ['app', 'patient-app', 'app']);
  assert.equal(config.rewrites.at(-1).source, '/(.*)');
  // Vite clients call the public same-origin API; there is no function-to-function call.
  assert.ok(Object.values(config.services).every(service => !service.bindings?.length));
  assert.equal(config.env.ONCOFLOW_DEMO_AUTO_CONNECT, 'true');
  assert.deepEqual(config.redirects.find(route => route.source === '/app'), { source: '/app', destination: '/app/', permanent: true });
});
