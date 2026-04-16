import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { TokenCache } from '../../src/auth/token-cache.js';
import { CreatorsApiClient } from '../../src/client/creators-api.js';
import type { AppConfig } from '../../src/config/env.js';
import { runSearchItems } from '../../src/tools/search-items.js';
import { runGetItems } from '../../src/tools/get-items.js';
import { runGetVariations } from '../../src/tools/get-variations.js';
import { runGetBrowseNodes } from '../../src/tools/get-browse-nodes.js';

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
const BASE = 'https://creatorsapi.amazon/catalog/v1';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function tokenOk() {
  return http.post(TOKEN_URL, () =>
    HttpResponse.json({ access_token: 'tok', token_type: 'bearer', expires_in: 3600 }),
  );
}

function deps() {
  const tokens = new TokenCache(config);
  const client = new CreatorsApiClient(config, tokens);
  return { config, client };
}

const ITEM = {
  asin: 'B09B2SBHQK',
  detailPageURL: 'https://www.amazon.com/dp/B09B2SBHQK?tag=tag-20&linkCode=osi',
  itemInfo: { title: { displayValue: 'Echo Show 5', label: 'Title' } },
  offersV2: {
    listings: [
      { isBuyBoxWinner: true, price: { money: { amount: 79.99, currency: 'USD', displayAmount: '$79.99' } } },
    ],
  },
};

describe('runSearchItems', () => {
  it('forwards partnerTag, partnerType, marketplace and returns markdown + structuredContent', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      tokenOk(),
      http.post(`${BASE}/searchItems`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ searchResult: { items: [ITEM], totalResultCount: 1 } });
      }),
    );
    const result = await runSearchItems(deps(), { keywords: 'echo', format: 'markdown' });
    expect(body.partnerTag).toBe('tag-20');
    expect(body.partnerType).toBe('Associates');
    expect(body.marketplace).toBe('www.amazon.com');
    expect(Array.isArray(body.resources)).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Echo Show 5');
    expect(result.structuredContent).toBeDefined();
  });

  it('returns JSON format when asked', async () => {
    server.use(
      tokenOk(),
      http.post(`${BASE}/searchItems`, () => HttpResponse.json({ searchResult: { items: [ITEM] } })),
    );
    const result = await runSearchItems(deps(), { keywords: 'echo', format: 'json' });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.searchResult.items[0].asin).toBe('B09B2SBHQK');
  });

  it('returns a single HTML text block when format is html-card', async () => {
    // v0.3.0: UI previews flow through the MCP Apps viewer resource
    // (registered server-side, discovered via `_meta.ui.resourceUri` on the
    // tool definition). The tool result itself is plain text — the HTML
    // document the creator pastes into their blog.
    server.use(
      tokenOk(),
      http.post(`${BASE}/searchItems`, () => HttpResponse.json({ searchResult: { items: [ITEM] } })),
    );
    const result = await runSearchItems(deps(), {
      keywords: 'echo',
      format: 'html-card',
      customStyles: '.amzn-card { background: black; }',
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    expect((result.content[0] as { text: string }).text).toContain('Echo Show 5');
    expect((result.content[0] as { text: string }).text).toContain('background: black');
    expect((result.content[0] as { text: string }).text).toContain('<!doctype html>');
  });

  it('requires at least one scoping field', async () => {
    server.use(tokenOk());
    await expect(runSearchItems(deps(), { format: 'markdown' })).rejects.toThrow(/at least one of/);
  });
});

describe('runGetItems', () => {
  it('sends asins as itemIds with itemIdType="ASIN"', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      tokenOk(),
      http.post(`${BASE}/getItems`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ itemsResult: { items: [ITEM] } });
      }),
    );
    const result = await runGetItems(deps(), {
      asins: ['B09B2SBHQK'],
      format: 'markdown',
    });
    expect(body.itemIds).toEqual(['B09B2SBHQK']);
    expect(body.itemIdType).toBe('ASIN');
    expect((result.content[0] as { text: string }).text).toContain('Echo Show 5');
  });
});

describe('runGetVariations', () => {
  it('forwards the parent asin', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      tokenOk(),
      http.post(`${BASE}/getVariations`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ variationsResult: { items: [ITEM] } });
      }),
    );
    const result = await runGetVariations(deps(), { asin: 'B09B2SBHQK', format: 'markdown' });
    expect(body.asin).toBe('B09B2SBHQK');
    expect((result.content[0] as { text: string }).text).toContain('## Variations');
  });
});

describe('runGetBrowseNodes', () => {
  it('forwards browseNodeIds and uses browse-node-specific resources', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      tokenOk(),
      http.post(`${BASE}/getBrowseNodes`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          browseNodesResult: {
            browseNodes: [{ id: '172282', displayName: 'Electronics', children: [] }],
          },
        });
      }),
    );
    const result = await runGetBrowseNodes(deps(), {
      browseNodeIds: ['172282'],
      format: 'markdown',
    });
    expect(body.browseNodeIds).toEqual(['172282']);
    // must be the browse-node-specific resource enum, NOT the item-level one.
    expect(body.resources).toEqual(['browseNodes.children', 'browseNodes.ancestor']);
    expect((result.content[0] as { text: string }).text).toContain('Electronics');
  });
});
