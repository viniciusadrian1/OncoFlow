import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT precisa ser uma porta entre 1 e 65535.');
const patient = path.resolve(process.env.ONCOFLOW_PATIENT_WEB_DIR || path.join(root, 'dist/app'));
const server = path.join(root, 'dist/server.cjs');
if (!existsSync(server) || !existsSync(path.join(patient, 'index.html'))) throw new Error('Execute npm run build:platform antes de iniciar a plataforma.');
const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), ONCOFLOW_PATIENT_WEB_DIR: patient,
  ONCOFLOW_DEMO_STATE_PATH: path.resolve(process.env.ONCOFLOW_DEMO_STATE_PATH || path.join(root, 'outputs/.oncoflow-demo/state.json')) };
console.log(`OncoFlow · demonstração fictícia\nPro: http://localhost:${port}/\nAplicativo web: http://localhost:${port}/app/`);
const addresses = new Set();
for (const entries of Object.values(networkInterfaces())) for (const entry of entries || []) {
  const parts = entry.address.split('.').map(Number);
  if (entry.family === 'IPv4' && !entry.internal && (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31))) addresses.add(entry.address);
}
for (const address of addresses) console.log(`Celular na mesma rede: http://${address}:${port} · marque Rede local de demonstração (HTTP) no app.`);
console.log('Mantenha este processo aberto durante a demonstração. Ctrl+C encerra o servidor.');
const child = spawn(process.execPath, [server], { cwd: root, env, stdio: 'inherit', shell: false, windowsHide: true });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { if (!child.killed) child.kill(signal); });
