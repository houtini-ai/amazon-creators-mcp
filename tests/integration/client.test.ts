import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { TokenCache } from '../../src/auth/token-cache.js';
import { CreatorsApiClient } from '../../src/client/creators-api.js';
import type { AppConfig } from '../../src/config/env.js';

const config: AppConfig = {
  clientId: 'cid',
  clientSecret: 'secret',
  partnerTag: 'tag-20',
  credentialVersion: '3.1',
  marketplace: 'www.amazon.com',
  region: 'NA',
  maxConcurrency: 4,
  debug: false,
};

const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const SEARCH_URL = 'https://creatorsapi.amazon/catalog/v1/searchItems';
const GET_ITEMS_URL = 'https://creatorsapi.amazon/catalog/v1/getItems';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function tokenHandler(token = 'tok-A', expiresIn = 3600) {
  return http.post(TOKEN_URL, () => HttpResponse.json({ access_token: token, token_type: 'bearer', expires_in: expiresIn }));
}

describe('CreatorsApiClient integration', () => {
  it('attaches Authorization + x-marketplace headers on every call', async () => {
    let capturedAuth: string | null = null;
    let capturedMarketplace: string | null = null;
    server.use(
      tokenHandler(),
      http.post(SEARCH_URL, ({ request }) => {
        capturedAuth = request.headers.get('authorization');
        capturedMarketplace = request.headers.get('x-marketplace');
        return HttpResponse.json({ searchResult: { items: [] } });
      }),
    );
    const tokens = new TokenCache(config);
    const client = new CreatorsApiClient(config, tokens);
    await client.call('searchItems', { keywords: 'x' });
    expect(capturedAuth).toBe('Bearer tok-A');
    expect(capturedMarketplace).toBe('www.amazon.com');
  });

  it('refreshes the token once on 401 and retries', async () => {
    const tokenCalls: string[] = [];
    let getItemsCount = 0;
    server.use(
      http.post(TOKEN_URL, async () => {
        tokenCalls.push(`call-${tokenCalls.length + 1}`);
        return HttpResponse.json({
          access_token: `tok-${tokenCalls.length}`,
          token_type: 'bearer',
          expires_in: 3600,
        });
      }),
      http.post(GET_ITEMS_URL, ({ request }) => {
        getItemsCount += 1;
        const auth = request.headers.get('authorization') ?? '';
        if (auth === 'Bearer tok-1') return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ itemsResult: { items: [{ asin: 'B01' }] } });
      }),
    );

    const tokens = new TokenCache(config);
    const client = new CreatorsApiClient(config, tokens);
    const result = (await client.call('getItems', { itemIds: ['B01'] })) as {
      itemsResult: { items: Array<{ asin: string }> };
    };
    expect(result.itemsResult.items[0]!.asin).toBe('B01');
    expect(tokenCalls).toEqual(['call-1', 'call-2']);
    expect(getItemsCount).toBe(2);
  });

  it('respects Retry-After on 429 and eventually succeeds', async () => {
    let call = 0;
    server.use(
      tokenHandler(),
      http.post(SEARCH_URL, () => {
        call += 1;
        if (call === 1) {
          return new HttpResponse(null, { status: 429, headers: { 'retry-after': '1' } });
        }
        return HttpResponse.json({ searchResult: { items: [{ asin: 'B2' }] } });
      }),
    );

    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const tokens = new TokenCache(config);
    const client = new CreatorsApiClient(config, tokens);
    const p = client.call('searchItems', { keywords: 'x' }) as Promise<{
      searchResult: { items: Array<{ asin: string }> };
    }>;

    // Let the first fetch + 429 response resolve, then advance the retry-after timer.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await p;
    vi.useRealTimers();
    expect(result.searchResult.items[0]!.asin).toBe('B2');
    expect(call).toBe(2);
  });

  it('surfaces partial-failure responses (items + errors)', async () => {
    server.use(
      tokenHandler(),
      http.post(GET_ITEMS_URL, () =>
        HttpResponse.json({
          itemsResult: { items: [{ asin: 'B001' }] },
          errors: [{ code: 'ItemNotAccessible', message: 'gone', asin: 'B002' }],
        }),
      ),
    );
    const tokens = new TokenCache(config);
    const client = new CreatorsApiClient(config, tokens);
    const result = (await client.call('getItems', { itemIds: ['B001', 'B002'] })) as {
      itemsResult: { items: Array<{ asin: string }> };
      errors: Array<{ asin?: string; message?: string }>;
    };
    expect(result.itemsResult.items).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.asin).toBe('B002');
  });

  it('throws on a non-429 4xx with the Amazon error body', async () => {
    server.use(
      tokenHandler(),
      http.post(SEARCH_URL, () =>
        HttpResponse.json(
          { errors: [{ code: 'InvalidParameterValue', message: 'bad' }], reason: 'FieldValidationFailed' },
          { status: 400 },
        ),
      ),
    );
    const tokens = new TokenCache(config);
    const client = new CreatorsApiClient(config, tokens);
    await expect(client.call('searchItems', {})).rejects.toThrow(/HTTP 400 from searchItems/);
  });

  it('gates concurrent requests by maxConcurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    server.use(
      tokenHandler(),
      http.post(SEARCH_URL, async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
        return HttpResponse.json({ searchResult: { items: [] } });
      }),
    );
    const tokens = new TokenCache({ ...config, maxConcurrency: 2 });
    const client = new CreatorsApiClient({ ...config, maxConcurrency: 2 }, tokens);
    await Promise.all(
      Array.from({ length: 6 }, () => client.call('searchItems', { keywords: 'x' })),
    );
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
