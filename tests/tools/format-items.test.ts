import { describe, it, expect } from 'vitest';
import { runFormatItems } from '../../src/tools/format-items.js';
import type { AppConfig } from '../../src/config/env.js';
import type { CreatorsApiClient } from '../../src/client/creators-api.js';

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

// format_items never hits the network — this stub asserts that by throwing
// loudly if the client is unexpectedly called.
const neverCalledClient = {
  call: async () => {
    throw new Error('format_items must not call the Amazon API');
  },
} as unknown as CreatorsApiClient;

const deps = { config, client: neverCalledClient };

const ITEM = {
  asin: 'B09B2SBHQK',
  detailPageURL: 'https://www.amazon.com/dp/B09B2SBHQK?tag=tag-20',
  itemInfo: { title: { displayValue: 'Echo Show 5' } },
  offersV2: {
    listings: [{ isBuyBoxWinner: true, price: { money: { amount: 79.99, currency: 'USD', displayAmount: '$79.99' } } }],
  },
};

describe('runFormatItems', () => {
  // As of v0.3.0 the tool result is plain text only — UI previews come from
  // the MCP Apps viewer resource registered on the server, discovered via
  // `_meta.ui.resourceUri` on the tool definition (see src/server.ts).

  it('accepts a previously-returned searchResult envelope as `response`', async () => {
    const result = await runFormatItems(deps, {
      response: { searchResult: { items: [ITEM] } },
      format: 'html-card',
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    expect((result.content[0] as { text: string }).text).toContain('Echo Show 5');
  });

  it('accepts an itemsResult envelope', async () => {
    const result = await runFormatItems(deps, {
      response: { itemsResult: { items: [ITEM, { ...ITEM, asin: 'B0B2C3D4E5', itemInfo: { title: { displayValue: 'Thing Two' } } }] } },
      format: 'html-grid',
    });
    const firstText = (result.content[0] as { text: string }).text;
    expect(firstText).toContain('Echo Show 5');
    expect(firstText).toContain('Thing Two');
    expect(firstText).toContain('class="amzn-grid"');
  });

  it('accepts a flat items[] array', async () => {
    const result = await runFormatItems(deps, {
      items: [ITEM],
      format: 'html-card',
    });
    expect((result.content[0] as { text: string }).text).toContain('Echo Show 5');
  });

  it('prefers `items` over `response` when both are given', async () => {
    const result = await runFormatItems(deps, {
      items: [ITEM],
      response: { itemsResult: { items: [] } },
      format: 'markdown',
    });
    expect((result.content[0] as { text: string }).text).toContain('Echo Show 5');
  });

  it('threads customStyles into the HTML output', async () => {
    const css = '.amzn-card__cta { background: hotpink; }';
    const result = await runFormatItems(deps, {
      items: [ITEM],
      format: 'html-card',
      customStyles: css,
    });
    expect((result.content[0] as { text: string }).text).toContain(css);
  });

  it('produces different HTML when customStyles change (viewer re-renders per call)', async () => {
    const a = await runFormatItems(deps, { items: [ITEM], format: 'html-card', customStyles: '.amzn-card { border: 1px solid red; }' });
    const b = await runFormatItems(deps, { items: [ITEM], format: 'html-card', customStyles: '.amzn-card { border: 2px solid blue; }' });
    const htmlA = (a.content[0] as { text: string }).text;
    const htmlB = (b.content[0] as { text: string }).text;
    expect(htmlA).not.toBe(htmlB);
    expect(htmlA).toContain('red');
    expect(htmlB).toContain('blue');
  });

  it('supports markdown format (same plain-text shape)', async () => {
    const result = await runFormatItems(deps, { items: [ITEM], format: 'markdown' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    expect((result.content[0] as { text: string }).text).toContain('Echo Show 5');
  });

  it('throws when neither `response` nor `items` provided', async () => {
    await expect(runFormatItems(deps, { format: 'html-card' })).rejects.toThrow(/requires either/);
  });

  it('renders the caller-supplied retrievedAt next to the price', async () => {
    const result = await runFormatItems(deps, {
      items: [ITEM],
      format: 'html-card',
      retrievedAt: '2026-04-16T14:34:00Z',
    });
    const html = (result.content[0] as { text: string }).text;
    expect(html).toContain('<time datetime="2026-04-16T14:34:00Z">16 Apr 2026, 14:34 UTC</time>');
  });

  it('defaults retrievedAt to now when omitted (re-render safety)', async () => {
    const result = await runFormatItems(deps, { items: [ITEM], format: 'html-card' });
    const html = (result.content[0] as { text: string }).text;
    expect(html).toMatch(/as of <time datetime="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z">\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC<\/time>/);
  });

  it('applies the default 80-char title cap on html-card output', async () => {
    const longTitle = {
      ...ITEM,
      asin: 'B00LONG0001',
      itemInfo: {
        title: {
          displayValue:
            'SuperBrand Ultimate 4K HDR Smart LED Television 65-inch with Dolby Vision, HDR10+, Built-in Alexa and Google Assistant, 120Hz Refresh Rate, 2026 Model, Black',
        },
      },
    };
    const result = await runFormatItems(deps, { items: [longTitle], format: 'html-card' });
    const html = (result.content[0] as { text: string }).text;
    const h3 = html.match(/<h3 class="amzn-card__title"><a[^>]*>([^<]+)<\/a><\/h3>/);
    expect(h3).not.toBeNull();
    // Ellipsis appended; ≤ 80 chars.
    expect(h3![1]!.length).toBeLessThanOrEqual(80);
    expect(h3![1]!.endsWith('\u2026')).toBe(true);
  });

  it('leaves the title untruncated in markdown output regardless of titleMaxChars', async () => {
    const longTitle = {
      ...ITEM,
      asin: 'B00LONG0002',
      itemInfo: {
        title: {
          displayValue:
            'SuperBrand Ultimate 4K HDR Smart LED Television 65-inch with Dolby Vision, HDR10+, Built-in Alexa',
        },
      },
    };
    const result = await runFormatItems(deps, {
      items: [longTitle],
      format: 'markdown',
      titleMaxChars: 40,
    });
    const md = (result.content[0] as { text: string }).text;
    // Full title should be present even though titleMaxChars=40.
    expect(md).toContain('Built-in Alexa');
  });

  it('applies the no-price filter on html-grid by default', async () => {
    const priced = { ...ITEM };
    const noPrice = { asin: 'B00NOPRICE', itemInfo: { title: { displayValue: 'No Price' } } };
    const result = await runFormatItems(deps, {
      items: [priced, noPrice],
      format: 'html-grid',
    });
    const html = (result.content[0] as { text: string }).text;
    expect(html).toContain('Echo Show 5');
    expect(html).not.toContain('No Price');
  });

  it('keeps no-price items on html-grid when hideItemsWithoutPrice is false', async () => {
    const priced = { ...ITEM };
    const noPrice = { asin: 'B00NOPRICE', itemInfo: { title: { displayValue: 'No Price' } } };
    const result = await runFormatItems(deps, {
      items: [priced, noPrice],
      format: 'html-grid',
      hideItemsWithoutPrice: false,
    });
    const html = (result.content[0] as { text: string }).text;
    expect(html).toContain('Echo Show 5');
    expect(html).toContain('No Price');
    expect(html).toContain('Check price on Amazon');
  });
});
