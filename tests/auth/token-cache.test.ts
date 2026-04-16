import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenCache } from '../../src/auth/token-cache.js';
import type { AppConfig } from '../../src/config/env.js';

const baseConfig: AppConfig = {
  clientId: 'cid',
  clientSecret: 'secret',
  partnerTag: 'tag-20',
  credentialVersion: '3.1',
  marketplace: 'www.amazon.com',
  region: 'NA',
  maxConcurrency: 4,
  debug: false,
};

function mockFetchOnce(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  });
  return fn;
}

describe('TokenCache', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('fetches a fresh token and uses the NA endpoint for region=NA', async () => {
    const f = mockFetchOnce(200, { access_token: 'tok-1', token_type: 'bearer', expires_in: 3600 });
    globalThis.fetch = f as unknown as typeof fetch;

    const cache = new TokenCache(baseConfig);
    const tok = await cache.getToken();
    expect(tok).toBe('tok-1');
    const [calledUrl] = f.mock.calls[0];
    expect(calledUrl).toBe('https://api.amazon.com/auth/o2/token');
  });

  it('re-uses the cached token when not near expiry', async () => {
    const f = mockFetchOnce(200, { access_token: 'tok-A', token_type: 'bearer', expires_in: 3600 });
    globalThis.fetch = f as unknown as typeof fetch;

    const cache = new TokenCache(baseConfig);
    expect(await cache.getToken()).toBe('tok-A');
    expect(await cache.getToken()).toBe('tok-A'); // cached — no second fetch call
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent callers to one fetch', async () => {
    let resolveFn!: (v: unknown) => void;
    const deferred = new Promise<unknown>((r) => (resolveFn = r));
    const f = vi.fn().mockReturnValueOnce(deferred);
    globalThis.fetch = f as unknown as typeof fetch;

    const cache = new TokenCache(baseConfig);
    const p1 = cache.getToken();
    const p2 = cache.getToken();
    const p3 = cache.getToken();
    expect(f).toHaveBeenCalledTimes(1);
    resolveFn({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600 })),
    });
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual(['t', 't', 't']);
  });

  it('refetches after invalidate()', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ access_token: 'A', token_type: 'bearer', expires_in: 3600 })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ access_token: 'B', token_type: 'bearer', expires_in: 3600 })),
      });
    globalThis.fetch = f as unknown as typeof fetch;

    const cache = new TokenCache(baseConfig);
    expect(await cache.getToken()).toBe('A');
    cache.invalidate();
    expect(await cache.getToken()).toBe('B');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('uses the EU endpoint for region=EU', async () => {
    const f = mockFetchOnce(200, { access_token: 'eu-tok', token_type: 'bearer', expires_in: 3600 });
    globalThis.fetch = f as unknown as typeof fetch;
    const cache = new TokenCache({ ...baseConfig, region: 'EU', marketplace: 'www.amazon.co.uk' });
    await cache.getToken();
    expect(f.mock.calls[0][0]).toBe('https://api.amazon.co.uk/auth/o2/token');
  });

  it('surfaces non-200 responses with status and body', async () => {
    const f = mockFetchOnce(400, 'bad-client');
    globalThis.fetch = f as unknown as typeof fetch;
    const cache = new TokenCache(baseConfig);
    await expect(cache.getToken()).rejects.toThrow(/Token fetch failed: 400/);
  });

  it('rejects on malformed JSON from the token endpoint', async () => {
    const f = mockFetchOnce(200, 'not json');
    globalThis.fetch = f as unknown as typeof fetch;
    const cache = new TokenCache(baseConfig);
    await expect(cache.getToken()).rejects.toThrow(/Token endpoint returned non-JSON/);
  });

  it('rejects on missing fields in the token response', async () => {
    const f = mockFetchOnce(200, { token_type: 'bearer' });
    globalThis.fetch = f as unknown as typeof fetch;
    const cache = new TokenCache(baseConfig);
    await expect(cache.getToken()).rejects.toThrow(/unexpected shape/);
  });
});
