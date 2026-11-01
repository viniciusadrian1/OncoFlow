import { fileURLToPath } from 'node:url';
import { runNpm } from './process.mjs';
import { createStaticOutput } from './static-output.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await runNpm(['run', 'build'], root);
const files = await createStaticOutput(root, { includePatient: false });
console.log(`Vercel app: ${files.length} arquivos do Pro em dist-static; API em api/index.ts. O serviço patient-app tem build independente.`);
