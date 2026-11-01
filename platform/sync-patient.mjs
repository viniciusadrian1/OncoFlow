/** Only named source files enter the versioned app. Never traverse .env, builds or dependency trees. */
import { copyFile, lstat, mkdir, readFile, readdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInside } from './process.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const TOP_FILES = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'vitest.config.ts', 'playwright.config.ts', 'capacitor.config.ts', 'index.html', 'README.md', '.gitignore', '.env.example']);
const EXTRA_FILES = new Set(['scripts/copy-vad-assets.mjs', 'scripts/build-android.ps1',
  'docs/android-build.md', 'docs/hospital-integration.md', 'docs/lia-provider-selection.md', 'docs/verification-v010.md', 'docs/verification-v011.md', 'docs/verification-v0111.md',
  'public/vad/LICENSE-ONNXRUNTIME.txt', 'public/vad/LICENSE-SILERO.txt', 'public/vad/LICENSE-VAD-WEB.txt',
  'android/build.gradle', 'android/settings.gradle', 'android/capacitor.settings.gradle',
  'android/variables.gradle', 'android/gradle.properties', 'android/gradlew', 'android/gradlew.bat',
  'android/.gitignore', 'android/gradle/wrapper/gradle-wrapper.jar', 'android/gradle/wrapper/gradle-wrapper.properties',
  'android/app/build.gradle', 'android/app/capacitor.build.gradle', 'android/app/proguard-rules.pro', 'android/app/.gitignore',
  'android/app/src/main/AndroidManifest.xml', 'android/app/src/debug/AndroidManifest.xml',
  'android/app/src/test/AndroidManifest.xml', 'android/app/src/androidTest/AndroidManifest.xml']);
const TREES = [
  ['src', /\.(?:ts|tsx|css|svg|json|d\.ts)$/i], ['shared', /\.(?:ts|tsx|json)$/i],
  ['tests', /\.(?:ts|tsx|mjs|js|json|svg|txt)$/i],
  ['public/brand', /\.(?:svg|png|jpg|jpeg|webp|ttf|woff2?|txt)$/i],
  ['public/visual', /\.(?:svg|png|jpg|jpeg|webp|txt)$/i],
  ['android/app/src/main/java', /\.java$/i], ['android/app/src/main/res', /\.(?:xml|png|webp|jpg)$/i],
  ['android/app/src/test/java', /\.java$/i], ['android/app/src/androidTest/java', /\.java$/i],
];
const FORBIDDEN_PART = /^(?:node_modules|dist|build|\.gradle|\.git|outputs?|reports?|test-results.*|assets)$/i;
const FORBIDDEN_FILE = /(?:\.(?:apk|aab|jks|keystore|log|pem|p12|pfx)$|^local\.properties$)/i;

export function isAllowedPatientPath(relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || path.posix.isAbsolute(relative)) return false;
  const segments = relative.split('/');
  if (segments.some(part => !part || part === '.' || part === '..' || FORBIDDEN_PART.test(part))) return false;
  if (relative !== '.env.example' && segments.some(part => part.startsWith('.env'))) return false;
  if (FORBIDDEN_FILE.test(segments.at(-1))) return false;
  return TOP_FILES.has(relative) || EXTRA_FILES.has(relative) || TREES.some(([tree, extension]) => relative.startsWith(`${tree}/`) && extension.test(relative));
}

async function optionalStat(filename) {
  try { return await lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function collectPatientFiles(sourceRoot) {
  const source = await realpath(sourceRoot);
  const sourceStat = await lstat(sourceRoot);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error('A origem deve ser uma pasta de código real, sem link simbólico.');
  const files = [];
  const add = async relative => {
    const filename = path.resolve(source, relative);
    assertInside(source, filename);
    const stat = await optionalStat(filename);
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error(`Link simbólico não permitido na origem: ${relative}`);
    if (stat.isFile() && isAllowedPatientPath(relative)) {
      const actual = await realpath(filename);
      assertInside(source, actual);
      files.push({ relative, source: filename });
    }
  };
  const walk = async relative => {
    const directory = path.resolve(source, relative);
    assertInside(source, directory);
    const stat = await optionalStat(directory);
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error(`Link simbólico não permitido na origem: ${relative}`);
    if (!stat.isDirectory()) return;
    assertInside(source, await realpath(directory));
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (FORBIDDEN_PART.test(entry.name) || entry.name.startsWith('.env') || FORBIDDEN_FILE.test(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Link simbólico não permitido na origem: ${child}`);
      if (entry.isDirectory()) await walk(child);
      else await add(child);
    }
  };
  for (const filename of [...TOP_FILES, ...EXTRA_FILES]) await add(filename);
  for (const [tree] of TREES) await walk(tree);
  const unique = [...new Map(files.map(file => [file.relative, file])).values()].sort((a, b) => a.relative.localeCompare(b.relative));
  if (!unique.some(file => file.relative === 'package.json') || !unique.some(file => file.relative === 'src/main.tsx')) throw new Error('Origem incompleta: faltam package.json ou src/main.tsx.');
  return { source, files: unique };
}

export async function syncPatientSource(sourceRoot, projectRoot = PROJECT_ROOT) {
  const root = await realpath(projectRoot);
  const destination = path.resolve(root, 'patient-app');
  assertInside(root, destination);
  const existing = await optionalStat(destination);
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error('patient-app precisa ser uma pasta real dentro do repositório.');
  const { source, files } = await collectPatientFiles(sourceRoot);
  if (source === destination || source.startsWith(`${destination}${path.sep}`) || destination.startsWith(`${source}${path.sep}`)) throw new Error('Origem e destino devem ser pastas separadas.');
  await mkdir(destination, { recursive: true });
  const manifestPath = path.join(destination, '.source-manifest.json');
  await checkDestination(destination, manifestPath);
  let previous = [];
  try { previous = JSON.parse(await readFile(manifestPath, 'utf8')).files ?? []; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const selected = new Set(files.map(file => file.relative));
  // Remove only formerly managed allowlisted files, never local configuration or an arbitrary tree.
  for (const old of previous) {
    if (!isAllowedPatientPath(old.path) || selected.has(old.path)) continue;
    const stale = path.resolve(destination, old.path); assertInside(destination, stale);
    await checkDestination(destination, stale);
    const stat = await optionalStat(stale);
    if (stat?.isSymbolicLink()) throw new Error('Link simbólico inesperado no destino.');
    if (stat?.isFile()) await unlink(stale);
  }
  const manifest = [];
  for (const file of files) {
    const target = path.resolve(destination, file.relative);
    assertInside(destination, target);
    await checkDestination(destination, target);
    assertInside(source, await realpath(file.source));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(file.source, target);
    manifest.push({ path: file.relative, sha256: createHash('sha256').update(await readFile(target)).digest('hex') });
  }
  const pkg = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'));
  await writeFile(manifestPath, `${JSON.stringify({ schema: 1, appVersion: pkg.version, files: manifest }, null, 2)}\n`);
  return { destination, appVersion: pkg.version, count: files.length };
}

async function checkDestination(destination, target) {
  assertInside(destination, target);
  let current = target;
  while (current !== destination) {
    if ((await optionalStat(current))?.isSymbolicLink()) throw new Error('Link simbólico inesperado no destino.');
    current = path.dirname(current);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error('Uso: npm run sync:patient -- [pasta-da-origem]');
  const result = await syncPatientSource(path.resolve(args[0] || path.join(PROJECT_ROOT, '../oncoflow-patient')));
  console.log(`App ${result.appVersion}: ${result.count} arquivos de código sincronizados em patient-app. Configurações locais e builds excluídos.`);
}
