import { copyFile, lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { assertInside } from './process.mjs';

const ROOT_FILES = new Set(['index.html', 'favicon.svg', 'favicon.ico', 'robots.txt', 'manifest.webmanifest']);
const EXTENSION = /\.(?:html|js|mjs|css|svg|png|jpe?g|webp|ico|ttf|woff2?|wasm|onnx|txt|webmanifest)$/i;

export function isPublicFrontendPath(relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || path.posix.isAbsolute(relative)) return false;
  const parts = relative.split('/');
  if (parts.some(part => !part || part.startsWith('.') || /^(?:server|BuildConfig)(?:\.|$)/i.test(part))) return false;
  if (/\.(?:map|cjs|ts|tsx|env|pem|key|jks|keystore)$/i.test(relative)) return false;
  if (ROOT_FILES.has(relative)) return true;
  return ['app', 'assets', 'brand'].includes(parts[0]) && parts.length > 1 && EXTENSION.test(relative);
}

export async function createStaticOutput(projectRoot, { includePatient = true } = {}) {
  const root = await realpath(projectRoot);
  const input = path.join(root, 'dist'); const output = path.join(root, 'dist-static');
  assertInside(root, input); assertInside(root, output);
  if ((await lstat(input)).isSymbolicLink()) throw new Error('dist não pode ser um link simbólico.');
  try {
    if ((await lstat(output)).isSymbolicLink()) throw new Error('dist-static não pode ser um link simbólico.');
    assertInside(root, await realpath(output));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const selected = [];
  async function collect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Build contém link simbólico inesperado.');
      if (entry.isDirectory()) {
        if (!prefix && entry.name === 'app' && !includePatient) continue;
        if (!prefix && !['app', 'assets', 'brand'].includes(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        await collect(filename, relative);
      } else if (isPublicFrontendPath(relative)) selected.push(relative);
    }
  }
  await collect(input);
  if (!selected.includes('index.html') || (includePatient && !selected.includes('app/index.html'))) throw new Error('Build incompleto: faltam os frontends selecionados.');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const relative of selected) {
    const target = path.join(output, relative); assertInside(output, target);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(input, relative), target);
  }
  return selected;
}
