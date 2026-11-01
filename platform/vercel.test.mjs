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

test('Vercel routes preserve the complete API path and publish only dist-static with Node 24', async () => {
  const config = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(config.framework, null); assert.equal(pkg.engines.node, '24.x');
  assert.equal(config.buildCommand, 'npm run build:vercel'); assert.equal(config.outputDirectory, 'dist-static');
  assert.equal(config.rewrites[1].source, '/api/:path*');
  assert.equal(config.rewrites[1].destination, '/api/index?__oncoflow_path=/api/:path*');
  assert.equal(Object.keys(config.functions).length, 1); assert.ok(config.functions['api/index.ts']);
  assert.equal(config.env.ONCOFLOW_DEMO_AUTO_CONNECT, 'true');
  assert.deepEqual(config.redirects.find(route => route.source === '/app'), { source: '/app', destination: '/app/', permanent: true });
});
