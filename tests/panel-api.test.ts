import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chamarApi } from '../src/api/pro.ts';

test('Pro preserves its team identity and passes cancellation to the request', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let options: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    options = init;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    await chamarApi('/api/pro/pacientes/test/mobile-data', 'team-navigation', undefined, { signal: controller.signal });
    assert.equal(options?.signal, controller.signal);
    assert.equal((options?.headers as Record<string, string>)['x-demo-usuario'], 'team-navigation');
    assert.equal(options?.method, 'GET');
  } finally { globalThis.fetch = originalFetch; }
});

test('Pro publication rejects an unsuccessful acknowledgement', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ mensagem: 'Publication was rejected' }), { status: 403 });
  try {
    await assert.rejects(chamarApi('/api/pro/pacientes/test/documents', 'team-navigation', { publish: true }), /Publication was rejected/);
  } finally { globalThis.fetch = originalFetch; }
});
