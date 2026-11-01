import { fileURLToPath } from 'node:url';
import { runNpm } from './process.mjs';
import { createStaticOutput } from './static-output.mjs';
import { createVercelOutput } from './vercel-output.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await runNpm(['run', 'build'], root);
const files = await createStaticOutput(root, { includePatient: false });
await createVercelOutput(root);
console.log(`Vercel app: ${files.length} arquivos públicos do Pro e função Node em .vercel/output/functions/api/index.func. O serviço patient-app tem build independente.`);
