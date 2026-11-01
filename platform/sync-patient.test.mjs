import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPatientFiles, isAllowedPatientPath, syncPatientSource } from './sync-patient.mjs';
import { assertInside } from './process.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

test('allowlist excludes secrets, local SDK config, binaries and generated assets', () => {
  for (const item of ['.env', '.env.local', 'src/.env', 'android/local.properties', 'android/.gradle/cache',
    'android/app/src/main/assets/capacitor.config.json', 'android/app/build/generated/BuildConfig.java',
    'dist/index.html', 'node_modules/react/index.js', 'public/vad/silero_vad_v5.onnx', 'output/app.apk',
    'android/release.keystore', '../outside.ts', 'src/../../outside.ts', 'src\\outside.ts']) assert.equal(isAllowedPatientPath(item), false, item);
  for (const item of ['.env.example', 'src/main.tsx', 'shared/hospitalContracts.ts', 'public/brand/Manrope.ttf',
    'android/app/src/main/java/br/com/oncoflow/paciente/LiaProviderPlugin.java',
    'android/app/src/main/res/xml/file_paths.xml', 'android/gradle/wrapper/gradle-wrapper.jar',
    'tests/unit/nativeHospitalHttp.test.ts', 'scripts/build-android.ps1']) assert.equal(isAllowedPatientPath(item), true, item);
});

test('source sync copies only allowed files and removes only stale managed source', async () => {
  const artifacts = path.join(projectRoot, 'test-results');
  await mkdir(artifacts, { recursive: true });
  const fixture = await mkdtemp(path.join(artifacts, 'platform-fixture-'));
  assertInside(artifacts, fixture);
  const source = path.join(fixture, 'source'); const repo = path.join(fixture, 'repo');
  await mkdir(path.join(source, 'src'), { recursive: true }); await mkdir(repo);
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'fictional-fixture', version: '0.10.0' }));
  await writeFile(path.join(source, 'src/main.tsx'), 'export const demo = true;');
  await writeFile(path.join(source, 'src/retired.ts'), 'export const retired = true;');
  await writeFile(path.join(source, '.env'), 'EXCLUDED_FIXTURE=do-not-copy');
  await writeFile(path.join(source, '.env.example'), 'EXAMPLE_ONLY=');
  await mkdir(path.join(source, 'android/app/build/generated'), { recursive: true });
  await writeFile(path.join(source, 'android/app/build/generated/BuildConfig.java'), 'excluded generated fixture');
  try {
    const inventory = await collectPatientFiles(source);
    assert.deepEqual(inventory.files.map(file => file.relative), ['.env.example', 'package.json', 'src/main.tsx', 'src/retired.ts']);
    const result = await syncPatientSource(source, repo);
    assert.equal(result.appVersion, '0.10.0'); assert.equal(result.count, 4);
    await writeFile(path.join(result.destination, 'local-note.txt'), 'untouched');
    await rm(path.join(source, 'src/retired.ts'));
    await syncPatientSource(source, repo);
    await assert.rejects(readFile(path.join(result.destination, '.env')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(result.destination, 'src/retired.ts')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(result.destination, 'local-note.txt'), 'utf8'), 'untouched');
    const manifest = JSON.parse(await readFile(path.join(result.destination, '.source-manifest.json'), 'utf8'));
    assert.equal(manifest.files.length, 3); assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/);
  } finally {
    assertInside(artifacts, fixture);
    await rm(fixture, { recursive: true, force: true });
  }
});
