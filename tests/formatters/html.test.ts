import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  extractItems,
  formatHtmlCard,
  formatHtmlGrid,
} from '../../src/formatters/html.js';
import type {
  GetItemsResponse,
  SearchItemsResponse,
  GetVariationsResponse,
  Item,
} from '../../src/types/creators.js';

const ITEM_A: Item = {
  asin: 'B09B2SBHQK',
  detailPageURL: 'https://www.amazon.com/dp/B09B2SBHQK?tag=tag-20&linkCode=osi',
  images: { primary: { large: { url: 'https://img/large.jpg' } } },
  itemInfo: {
    title: { displayValue: 'Echo Show 5' },
    byLineInfo: { brand: { displayValue: 'Amazon' } },
  },
  offersV2: {
    listings: [
      {
        isBuyBoxWinner: true,
        price: {
          money: { amount: 79.99, currency: 'USD', displayAmount: '$79.99' },
          savings: { money: { amount: 10, currency: 'USD', displayAmount: '$10.00' }, percentage: 11 },
        },
      },
    ],
  },
  customerReviews: { count: 1234, starRating: { value: 4.6 } },
};

const ITEM_B: Item = {
  asin: 'B0B2C3D4E5',
  detailPageURL: 'https://www.amazon.com/dp/B0B2C3D4E5?tag=tag-20',
  itemInfo: { title: { displayValue: 'Thing Two' } },
};

const BASE_INPUT = { partnerTag: 'tag-20', marketplace: 'www.amazon.com' };

describe('escapeHtml', () => {
  it('escapes &, <, >, ", and \'', () => {
    expect(escapeHtml(`<script>alert("x&y's")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&amp;y&#39;s&quot;)&lt;/script&gt;',
    );
  });
});

describe('extractItems', () => {
  it('unwraps searchResult.items', () => {
    const r: SearchItemsResponse = { searchResult: { items: [ITEM_A] } };
    expect(extractItems(r)).toEqual([ITEM_A]);
  });
  it('unwraps itemsResult.items', () => {
    const r: GetItemsResponse = { itemsResult: { items: [ITEM_A, ITEM_B] } };
    expect(extractItems(r)).toEqual([ITEM_A, ITEM_B]);
  });
  it('unwraps variationsResult.items', () => {
    const r: GetVariationsResponse = { variationsResult: { items: [ITEM_B] } };
    expect(extractItems(r)).toEqual([ITEM_B]);
  });
  it('returns [] when envelope is missing', () => {
    expect(extractItems({} as GetItemsResponse)).toEqual([]);
  });
});

describe('formatHtmlCard', () => {
  it('renders a doc with stable class-name anchors', () => {
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [ITEM_A] } },
    });
    // Every anchor a customStyles author might target should be present.
    for (const cls of [
      'amzn-card',
      'amzn-card__image-wrap',
      'amzn-card__image',
      'amzn-card__title',
      'amzn-card__meta',
      'amzn-card__brand',
      'amzn-card__rating',
      'amzn-card__price',
      'amzn-card__savings',
      'amzn-card__cta',
      'amzn-card__disclosure',
    ]) {
      expect(out.text).toContain(cls);
    }
    expect(out.text).toContain('<!doctype html>');
    expect(out.text).toContain('Echo Show 5');
    expect(out.text).toContain('$79.99');
    expect(out.text).toContain('4.6★');
    // Uses the pre-tagged detailPageURL.
    expect(out.text).toContain('tag=tag-20');
    // Outbound affiliate links are annotated.
    expect(out.text).toContain('rel="nofollow sponsored noopener"');
    // data-asin attribute for scripting.
    expect(out.text).toContain('data-asin="B09B2SBHQK"');
    expect(out.structured).toEqual({ itemsResult: { items: [ITEM_A] } });
  });

  it('renders only the first item when many are given', () => {
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [ITEM_A, ITEM_B] } },
    });
    expect(out.text).toContain('Echo Show 5');
    expect(out.text).not.toContain('Thing Two');
  });

  it('appends customStyles verbatim to the <style> block', () => {
    const css = `.amzn-card__cta { background: hotpink !important; }`;
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [ITEM_A] } },
      customStyles: css,
    });
    expect(out.text).toContain('/* customStyles */');
    expect(out.text).toContain(css);
    // Must come AFTER the default styles so user rules win by cascade order.
    const defaultIdx = out.text.indexOf('.amzn-card {');
    const customIdx = out.text.indexOf(css);
    expect(customIdx).toBeGreaterThan(defaultIdx);
  });

  it('renders "as of <ts>" next to the price when retrievedAt is passed', () => {
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [ITEM_A] } },
      retrievedAt: '2026-04-16T14:34:00Z',
    });
    // Timestamp + class anchor present
    expect(out.text).toContain('amzn-card__price-timestamp');
    expect(out.text).toContain('as of');
    expect(out.text).toContain('<time datetime="2026-04-16T14:34:00Z">16 Apr 2026, 14:34 UTC</time>');
    // It lives inside the same <p class="amzn-card__price"> as the price so CMS
    // paste operations that strip siblings still keep them together.
    const priceParagraph = out.text.match(/<p class="amzn-card__price">[^<]*<span class="amzn-card__price-timestamp">/);
    expect(priceParagraph).not.toBeNull();
  });

  it('omits the timestamp span when there is no price to stamp', () => {
    const noPrice: Item = { asin: 'B00NOPRICE', itemInfo: { title: { displayValue: 'Pricey' } } };
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [noPrice] } },
      retrievedAt: '2026-04-16T14:34:00Z',
    });
    // The class exists in the <style> block regardless — assert the rendered span isn't present.
    expect(out.text).not.toContain('<span class="amzn-card__price-timestamp">');
    expect(out.text).not.toContain('<time datetime="2026-04-16T14:34:00Z">');
  });

  it('falls back to a fresh ISO timestamp when retrievedAt is omitted', () => {
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [ITEM_A] } },
    });
    // datetime attr is machine-readable ISO; visible text is humanised "D Mon YYYY, HH:MM UTC".
    expect(out.text).toMatch(/as of <time datetime="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z">\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC<\/time>/);
  });

  it('renders a friendly empty state when there are no items', () => {
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [] } },
    });
    expect(out.text).toContain('No product found.');
  });

  it('escapes HTML-unsafe characters in titles', () => {
    const hostile: Item = {
      asin: 'B00HOSTILE',
      itemInfo: { title: { displayValue: '<script>x</script> "&"' } },
    };
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [hostile] } },
    });
    expect(out.text).not.toContain('<script>x</script>');
    expect(out.text).toContain('&lt;script&gt;');
    expect(out.text).toContain('&quot;&amp;&quot;');
  });
});

describe('formatHtmlGrid', () => {
  it('renders one card per item inside .amzn-grid (with hideItemsWithoutPrice:false to keep both)', () => {
    const out = formatHtmlGrid({
      ...BASE_INPUT,
      response: { itemsResult: { items: [ITEM_A, ITEM_B] } },
      // ITEM_B has no price — opt-out of the default filter for this assertion.
      hideItemsWithoutPrice: false,
    });
    expect(out.text).toContain('class="amzn-grid"');
    expect(out.text).toContain('Echo Show 5');
    expect(out.text).toContain('Thing Two');
    expect(out.text).toContain('amzn-grid__disclosure');
    // Should have two <article> cards.
    const articleCount = (out.text.match(/<article class="amzn-card"/g) ?? []).length;
    expect(articleCount).toBe(2);
  });

  it('filters out items with no price by default (hideItemsWithoutPrice=true)', () => {
    // ITEM_A has a price; ITEM_B does not. The default filter should keep only ITEM_A.
    const out = formatHtmlGrid({
      ...BASE_INPUT,
      response: { itemsResult: { items: [ITEM_A, ITEM_B] } },
    });
    expect(out.text).toContain('Echo Show 5');
    expect(out.text).not.toContain('Thing Two');
    const articleCount = (out.text.match(/<article class="amzn-card"/g) ?? []).length;
    expect(articleCount).toBe(1);
  });

  it('includes no-price items when hideItemsWithoutPrice is false', () => {
    const out = formatHtmlGrid({
      ...BASE_INPUT,
      response: { itemsResult: { items: [ITEM_A, ITEM_B] } },
      hideItemsWithoutPrice: false,
    });
    // ITEM_B renders with the "Check price on Amazon" fallback block.
    expect(out.text).toContain('Thing Two');
    expect(out.text).toContain('amzn-card__price--unavailable');
    expect(out.text).toContain('Check price on Amazon');
  });

  it('renders empty state gracefully', () => {
    const out = formatHtmlGrid({
      ...BASE_INPUT,
      response: { searchResult: { items: [] } },
    });
    expect(out.text).toContain('No products found.');
  });

  it('renders empty state when every item is filtered out by the no-price filter', () => {
    const out = formatHtmlGrid({
      ...BASE_INPUT,
      response: { itemsResult: { items: [ITEM_B] } },
      // default hideItemsWithoutPrice=true → ITEM_B drops out → "no products found" block.
    });
    expect(out.text).toContain('No products found.');
  });
});

// ---------- The 3 new improvements: title truncation, price fallback, filter ----------

describe('formatHtmlCard — title truncation', () => {
  const LONG: Item = {
    asin: 'B00LONG',
    itemInfo: {
      title: {
        displayValue:
          'SuperBrand Ultimate 4K HDR Smart LED Television 65-inch with Dolby Vision, HDR10+, Built-in Alexa and Google Assistant, 120Hz Refresh Rate, 2026 Model, Black',
      },
    },
  };

  it('truncates long titles to the default 80-char cap when titleMaxChars is not set', () => {
    // Formatter default when called directly = no truncation (passes through what caller provides);
    // the 80-char default is applied by `renderToolOutput` in shared.ts. This test pins the
    // explicit-parameter contract of the formatter itself.
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [LONG] } },
      titleMaxChars: 80,
    });
    // Title anchor must contain an ellipsis and be clipped.
    const titleMatch = out.text.match(/<a href="[^"]*"[^>]*>([^<]+)<\/a>/);
    expect(titleMatch).not.toBeNull();
    // Find the <h3> title anchor specifically.
    const h3 = out.text.match(/<h3 class="amzn-card__title"><a[^>]*>([^<]+)<\/a><\/h3>/);
    expect(h3).not.toBeNull();
    const rendered = h3![1]!;
    expect(rendered.length).toBeLessThanOrEqual(80);
    expect(rendered.endsWith('\u2026')).toBe(true);
  });

  it('does not truncate when titleMaxChars is 0 / undefined', () => {
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [LONG] } },
      titleMaxChars: 0,
    });
    expect(out.text).toContain('2026 Model, Black');
  });

  it('escapes truncated title same as full title', () => {
    const hostile: Item = {
      asin: 'B00HOSTILE',
      itemInfo: {
        title: {
          displayValue:
            '<script>bad</script> and a lot more text to make sure we hit the truncation threshold for this assertion',
        },
      },
    };
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [hostile] } },
      titleMaxChars: 40,
    });
    expect(out.text).not.toContain('<script>bad</script>');
    expect(out.text).toContain('&lt;script&gt;');
  });
});

describe('formatHtmlCard — missing-price fallback', () => {
  it('renders "Check price on Amazon" link when no price is available', () => {
    const noPrice: Item = {
      asin: 'B00NOPRICE',
      detailPageURL: 'https://www.amazon.com/dp/B00NOPRICE?tag=tag-20',
      itemInfo: { title: { displayValue: 'Pricey' } },
    };
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [noPrice] } },
    });
    // Assertions target the rendered DOM (not the bundled stylesheet which
    // contains the class definition regardless of whether it's used).
    expect(out.text).toContain('<p class="amzn-card__price amzn-card__price--unavailable">');
    expect(out.text).toContain('Check price on Amazon');
    // No `as of <time>` stamp in the rendered card body when there's no price.
    expect(out.text).not.toContain('<span class="amzn-card__price-timestamp">');
    // The fallback link is annotated as a sponsored affiliate link.
    expect(out.text).toMatch(
      /amzn-card__price--unavailable"><a href="[^"]*" rel="nofollow sponsored noopener"/,
    );
  });

  it('retains the real price block when price data is present', () => {
    const out = formatHtmlCard({
      ...BASE_INPUT,
      response: { itemsResult: { items: [ITEM_A] } },
    });
    // These assertions target the rendered <p> element, not the stylesheet.
    expect(out.text).not.toContain('<p class="amzn-card__price amzn-card__price--unavailable">');
    expect(out.text).not.toContain('Check price on Amazon');
    expect(out.text).toContain('$79.99');
  });
});
