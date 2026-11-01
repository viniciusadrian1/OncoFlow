import { cp, lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInside, runNpm } from './process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundled = path.join(root, 'patient-app');
const sibling = path.resolve(root, '../oncoflow-patient');
const patient = existsSync(path.join(bundled, 'package.json')) ? bundled : sibling;
if (!existsSync(path.join(patient, 'package-lock.json'))) throw new Error('Código do paciente ausente. Inclua patient-app ou execute npm run sync:patient.');
if (patient === sibling) console.log('Desenvolvimento: usando o app da pasta irmã; a distribuição usa patient-app.');

if (!existsSync(path.join(root, 'node_modules/vite/package.json'))) await runNpm(['ci', '--no-audit', '--no-fund'], root);
if (!existsSync(path.join(patient, 'node_modules/vite/package.json'))) await runNpm(['ci', '--no-audit', '--no-fund'], patient);
await runNpm(['run', 'build'], patient);
const generated = path.join(root, 'public/app');
assertInside(path.join(root, 'public'), generated);
if ((await lstat(path.join(root, 'public'))).isSymbolicLink()) throw new Error('public precisa permanecer dentro do repositório.');
if (existsSync(generated)) {
  if ((await lstat(generated)).isSymbolicLink()) throw new Error('public/app deve ser uma pasta gerada, sem link simbólico.');
  assertInside(await realpath(path.join(root, 'public')), await realpath(generated));
}
await rm(generated, { recursive: true, force: true });
await mkdir(generated, { recursive: true });
await cp(path.join(patient, 'dist'), generated, { recursive: true });
await runNpm(['run', 'build'], root);
if (!existsSync(path.join(root, 'dist/app/index.html')) || !existsSync(path.join(root, 'dist/server.cjs'))) throw new Error('Build incompleto: faltam o aplicativo ou o servidor.');
console.log('Plataforma pronta: Pro em / e aplicativo em /app/. Execute npm run start:platform.');
