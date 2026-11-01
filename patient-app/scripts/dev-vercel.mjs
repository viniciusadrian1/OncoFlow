import { createServer } from 'vite';

// Vite does not read PORT automatically. Vercel allocates a different port for each service.
const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid service port.');
const server = await createServer({ base: '/app/', server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
server.printUrls();
