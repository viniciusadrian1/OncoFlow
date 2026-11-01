import { fileURLToPath } from 'node:url';
import { runNpm } from './process.mjs';
import { createStaticOutput } from './static-output.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await runNpm(['run', 'build:platform'], root);
const files = await createStaticOutput(root);
console.log(`Vercel: ${files.length} arquivos de frontend em dist-static; API servida exclusivamente por api/index.ts.`);
