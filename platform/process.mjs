import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

export function npmCliPath() {
  const candidates = [process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const found = candidates.find(candidate => candidate && existsSync(candidate));
  if (!found) throw new Error('npm não encontrado. Execute este comando com npm run ou instale Node.js 22.12+.');
  return found;
}

export function runNode(args, { cwd, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', shell: false, windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Comando terminou ${signal || `com código ${code}`}.`)));
  });
}

export function runNpm(args, cwd, env = process.env) {
  return runNode([npmCliPath(), ...args], { cwd, env });
}

export function assertInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('O caminho precisa permanecer dentro da pasta prevista.');
  }
}
