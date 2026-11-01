/** Durable, serialized fictional MVP transactions for the Vercel Node handler.
 * No account/resource is provisioned here. There is deliberately no memory fallback.
 */
import { Redis } from '@upstash/redis';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { criarApi } from './api';
import { unwrapApiPath } from './apiPath';
import type { CloudSnapshot } from './mobile';

export const COMMIT_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('PTTL', KEYS[1]) <= 0 then return 0 end
redis.call('SET', KEYS[2], ARGV[2])
redis.call('DEL', KEYS[1])
return 1`;
export const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

export class StoreUnavailable extends Error {
  constructor() { super('Durable fictional demo storage is unavailable.'); }
}
export interface SnapshotStore {
  acquire(owner: string, leaseMs: number): Promise<boolean>;
  read(): Promise<CloudSnapshot | null>;
  commit(owner: string, snapshot: CloudSnapshot): Promise<boolean>;
  release(owner: string): Promise<void>;
}
async function bounded<T>(operation: Promise<T>, milliseconds = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StoreUnavailable()), milliseconds); })]); }
  finally { clearTimeout(timer!); }
}

export function redisStoreFromEnv(env: NodeJS.ProcessEnv = process.env): SnapshotStore {
  const useUpstash = Boolean(env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN);
  const url = useUpstash ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL;
  const token = useUpstash ? env.UPSTASH_REDIS_REST_TOKEN : env.KV_REST_API_TOKEN;
  if (!url || !token) throw new StoreUnavailable();
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new StoreUnavailable(); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new StoreUnavailable();
  const namespace = env.ONCOFLOW_REDIS_NAMESPACE?.trim() || 'oncoflow:fictional-demo:v1';
  if (!/^[A-Za-z0-9:_-]{1,120}$/.test(namespace)) throw new StoreUnavailable();
  const redis = new Redis({ url, token, retry: false, enableAutoPipelining: false, automaticDeserialization: false });
  return createRedisStore(redis, namespace);
}

/** Uses the actual SDK command API; injection supports isolated Redis protocol tests. */
export function createRedisStore(redis: Pick<Redis, 'set' | 'get' | 'eval'>, namespace: string): SnapshotStore {
  const lock = `${namespace}:lock`, snapshotKey = `${namespace}:snapshot`;
  return {
    async acquire(owner, leaseMs) { return await bounded(redis.set(lock, owner, { nx: true, px: leaseMs })) === 'OK'; },
    async read() {
      const raw = await bounded(redis.get<string>(snapshotKey));
      if (raw === null) return null;
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > 1024 * 1024) throw new StoreUnavailable();
      try { return JSON.parse(raw) as CloudSnapshot; } catch { throw new StoreUnavailable(); }
    },
    async commit(owner, snapshot) {
      const json = JSON.stringify(snapshot);
      if (Buffer.byteLength(json) > 1024 * 1024) throw new StoreUnavailable();
      return Number(await bounded(redis.eval(COMMIT_SCRIPT, [lock, snapshotKey], [owner, json]))) === 1;
    },
    async release(owner) { await bounded(redis.eval(RELEASE_SCRIPT, [lock], [owner])); },
  };
}

// estado.ts is intentionally shared with the original MVP. Fluid Compute may run concurrent
// requests in one process, so this mutex covers ALL handler instances before Redis is loaded.
let processBusy = false;
const processWaiters: { enter(): void; reject(): void }[] = [];
async function processLock(waitMs: number): Promise<() => void> {
  if (processBusy) {
    if (processWaiters.length >= 100) throw new StoreUnavailable();
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const waiter = {
        enter() { clearTimeout(timer); resolve(); },
        reject() { const index = processWaiters.indexOf(waiter); if (index >= 0) processWaiters.splice(index, 1); reject(new StoreUnavailable()); },
      };
      timer = setTimeout(waiter.reject, waitMs); processWaiters.push(waiter);
    });
  } else processBusy = true;
  return () => { const next = processWaiters.shift(); if (next) next.enter(); else processBusy = false; };
}

/** The explicit Vercel rewrite keeps the complete existing API path. */
function normalizePath(req: IncomingMessage) {
  try { req.url = unwrapApiPath(req.url); } catch { throw new InputError(400); }
}

class InputError extends Error { constructor(public status: number) { super('Invalid API request.'); } }
async function parseBody(req: IncomingMessage): Promise<void> {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method ?? 'GET')) return;
  const request = req as IncomingMessage & { body?: unknown };
  function parsed(value: unknown) {
    try {
      const bytes = Buffer.isBuffer(value) ? value.toString('utf8') : typeof value === 'string' ? value : JSON.stringify(value);
      if (Buffer.byteLength(bytes) > 256 * 1024) throw new InputError(413);
      Object.defineProperty(request, 'body', { value: bytes ? JSON.parse(bytes) : {}, writable: true, enumerable: true, configurable: true });
    } catch (error) { if (error instanceof InputError) throw error; throw new InputError(400); }
  }
  if (req.headers['content-type'] && !/^application\/json(?:;|$)/i.test(req.headers['content-type'])) throw new InputError(415);
  // Vercel's getter can parse JSON or throw. Read it once inside the input boundary.
  let provided: unknown;
  try { provided = request.body; } catch { throw new InputError(400); }
  if (provided !== undefined) { parsed(provided); return; }
  if (req.readableEnded) { request.body = {}; return; }
  await new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    const timer = setTimeout(() => finish(new InputError(408)), 3000);
    const onData = (chunk: Buffer) => { size += chunk.byteLength; if (size > 256 * 1024) finish(new InputError(413)); else chunks.push(chunk); };
    const onEnd = () => { try { parsed(Buffer.concat(chunks)); finish(); } catch (error) { finish(error); } };
    const onError = () => finish(new InputError(400));
    function finish(error?: unknown) {
      clearTimeout(timer); req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onError);
      if (error) { req.resume(); reject(error); } else resolve();
    }
    req.on('data', onData); req.once('end', onEnd); req.once('error', onError); req.once('aborted', onError);
  });
}

function captureResponse(res: ServerResponse) {
  const end = res.end.bind(res), write = res.write.bind(res), writeHead = res.writeHead.bind(res);
  const chunks: Buffer[] = []; let bytes = 0, finished = false;
  const callbacks: (() => void)[] = [];
  let resolve!: () => void;
  const complete = new Promise<void>(done => { resolve = done; });
  function append(chunk: unknown, encoding?: unknown) {
    if (chunk === undefined || chunk === null) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding as BufferEncoding : 'utf8');
    bytes += buffer.byteLength; if (bytes > 4 * 1024 * 1024) throw new StoreUnavailable(); chunks.push(buffer);
  }
  res.writeHead = ((status: number, reason?: unknown, headers?: unknown) => {
    res.statusCode = status;
    const items = typeof reason === 'string' ? headers : reason;
    if (items && !Array.isArray(items)) for (const [key, value] of Object.entries(items as Record<string, string>)) res.setHeader(key, value);
    return res;
  }) as typeof res.writeHead;
  res.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
    append(chunk, encoding); const done = typeof encoding === 'function' ? encoding : callback; if (typeof done === 'function') callbacks.push(done as () => void); return true;
  }) as typeof res.write;
  res.end = ((chunk?: unknown, encoding?: unknown, callback?: unknown) => {
    if (!finished) {
      if (typeof chunk !== 'function') append(chunk, encoding);
      const done = typeof chunk === 'function' ? chunk : typeof encoding === 'function' ? encoding : callback;
      if (typeof done === 'function') callbacks.push(done as () => void);
      finished = true; resolve();
    }
    return res;
  }) as typeof res.end;
  function restore() { res.end = end; res.write = write; res.writeHead = writeHead; }
  return {
    complete,
    isComplete: () => finished,
    flush() { restore(); end(Buffer.concat(chunks), () => callbacks.forEach(callback => callback())); },
    fail() {
      restore();
      for (const key of res.getHeaderNames()) if (!String(key).toLowerCase().startsWith('access-control-') && String(key).toLowerCase() !== 'vary') res.removeHeader(key);
      unavailable(res);
    },
  };
}
function unavailable(res: ServerResponse) {
  if (res.destroyed || res.writableEnded) return;
  res.statusCode = 503; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Retry-After', '2');
  res.end(JSON.stringify({ erro: 'persistencia_indisponivel', mensagem: 'A demonstração precisa de armazenamento persistente disponível. Tente novamente; nenhum sucesso foi confirmado.' }));
}
export type CloudHandlerOptions = {
  store?: SnapshotStore;
  storeFactory?: () => SnapshotStore;
  autoConnect?: boolean;
  leaseMs?: number;
  waitMs?: number;
};
export function criarCloudHandler(options: CloudHandlerOptions = {}) {
  // Lazy creation performs no disk reads/writes and creates no timers/listeners on import.
  let api: ReturnType<typeof criarApi> | undefined;
  let store = options.store;
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    let unlockProcess: (() => void) | undefined;
    let owner: string | undefined;
    let captured: ReturnType<typeof captureResponse> | undefined;
    let before: CloudSnapshot | undefined;
    try {
      normalizePath(req);
      store ??= (options.storeFactory ?? redisStoreFromEnv)();
      await parseBody(req);
      unlockProcess = await processLock(options.waitMs ?? 2500);
      owner = randomBytes(24).toString('hex');
      const deadline = Date.now() + (options.waitMs ?? 2500);
      while (!await store.acquire(owner, options.leaseMs ?? 10_000)) {
        if (Date.now() >= deadline) throw new StoreUnavailable();
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      api ??= criarApi({ statePath: null, cloud: true, autoConnect: options.autoConnect });
      api.importSnapshot(await store.read());
      before = api.exportSnapshot();
      captured = captureResponse(res);
      // criarApi's cloud route graph contains only synchronous MVP handlers. Audio/AI,
      // filesystem/static and dev servers belong to server.ts and are never mounted here.
      // Parsing happened before the lock, so no body callback can mutate state afterwards.
      api.app(req as Request, res as Response, () => { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ erro: 'rota_nao_encontrada', mensagem: 'API não encontrada.' })); });
      // Express can yield between routers even though every business handler is synchronous.
      // Keep the process mutex for the entire route graph; never timeout/release it while
      // an in-flight route could still mutate shared state. Redis lease/CAS still bounds
      // ownership, and an overdue transaction is rejected at commit rather than published.
      await captured.complete;
      if (res.statusCode >= 500) {
        api.importSnapshot(before); await store.release(owner); owner = undefined;
      } else {
        // Commit and unlock are ONE Redis operation. An expired/replaced owner can never
        // overwrite newer state, even after a delayed request or a cold-start race.
        if (!await store.commit(owner, api.exportSnapshot())) throw new StoreUnavailable();
        owner = undefined;
      }
      captured.flush();
    } catch (error) {
      if (api && before) api.importSnapshot(before);
      if (captured) captured.fail();
      else if (error instanceof InputError) { res.statusCode = error.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ erro: 'requisicao_invalida', mensagem: 'Requisição inválida para a API.' })); }
      else unavailable(res);
    } finally {
      // Owner comparison makes cleanup safe after unknown command outcomes or lease loss.
      if (store && owner) try { await store.release(owner); } catch { /* TTL bounds a failed cleanup. */ }
      unlockProcess?.();
    }
  };
}
