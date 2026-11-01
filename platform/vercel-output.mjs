/** Explicit Build Output API: Services' Vite builder does not discover loose api/*.ts files. */
import { cp, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { assertInside } from './process.mjs';

export async function createVercelOutput(projectRoot) {
  const root = await realpath(projectRoot);
  const output = path.join(root, '.vercel/output');
  const staticOutput = path.join(output, 'static');
  const functionOutput = path.join(output, 'functions/api/index.func');
  async function guarded(target) {
    assertInside(root, target);
    for (let current = target; current !== root; current = path.dirname(current)) {
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new Error('Vercel output must stay inside the project without symbolic links.');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  for (const target of [output, staticOutput, functionOutput]) await guarded(target);
  await mkdir(output, { recursive: true });
  // Only replace this service's generated files; do not delete the parent .vercel directory.
  await rm(staticOutput, { recursive: true, force: true });
  await rm(functionOutput, { recursive: true, force: true });
  await mkdir(functionOutput, { recursive: true });
  await cp(path.join(root, 'dist-static'), staticOutput, { recursive: true });
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['api/index.ts'],
    outfile: path.join(functionOutput, 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    sourcemap: false,
    metafile: true,
    logLevel: 'warning',
  });
  const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name.replace(/^node:/, '')}`]));
  for (const artifact of Object.values(result.metafile.outputs)) {
    if (artifact.imports.some(item => item.external && !builtins.has(item.path))) throw new Error('The API artifact still depends on an external package.');
  }
  const config = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  await writeFile(path.join(functionOutput, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs24.x', handler: 'index.cjs', launcherType: 'Nodejs', shouldAddHelpers: true,
    maxDuration: config.services.app.functions['api/index.ts'].maxDuration,
  }, null, 2) + '\n');
  await writeFile(path.join(output, 'config.json'), '{"version":3}\n');
  return { output, functionOutput };
}
