import { describe, it, expect } from 'vitest';
import {
  classifyOutput,
  extractEmbeddable,
  fragmentPreviewDoc,
} from '../../src/mcp-apps/preview-doc.js';
import { formatDealsSection } from '../../src/formatters/deals.js';
import { DEALS_CSS } from '../../src/formatters/deals-css.js';

const DOC = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>.card{color:red}</style>
</head>
<body>
<div class="card">Hi</div>
</body>
</html>`;

const DEALS_RESPONSE = {
  searchResult: {
    items: [
      {
        asin: 'B000000001',
        detailPageURL: 'https://www.amazon.com/dp/B000000001',
        itemInfo: { title: { displayValue: 'Widget' } },
        offersV2: { listings: [{ price: { money: { amount: 10, currency: 'USD', displayAmount: '$10.00' } } }] },
      },
    ],
  },
};

describe('classifyOutput', () => {
  it('treats doctype and <html> output as a document', () => {
    expect(classifyOutput(DOC)).toBe('document');
    expect(classifyOutput('  <html><body></body></html>')).toBe('document');
  });

  it('treats html-deals output as a fragment, with or without its stylesheet', () => {
    const bare = formatDealsSection({ response: DEALS_RESPONSE, marketplace: 'www.amazon.com', partnerTag: 't-20' }).text;
    const styled = formatDealsSection({
      response: DEALS_RESPONSE,
      marketplace: 'www.amazon.com',
      partnerTag: 't-20',
      includeCss: true,
    }).text;
    expect(classifyOutput(bare)).toBe('fragment');
    expect(classifyOutput(styled)).toBe('fragment');
  });

  it('treats markdown and JSON as text', () => {
    expect(classifyOutput('# Results\n\n- item')).toBe('text');
    expect(classifyOutput('{"items":[]}')).toBe('text');
    expect(classifyOutput('a < b')).toBe('text');
  });
});

describe('extractEmbeddable', () => {
  it('returns a fragment unchanged', () => {
    expect(extractEmbeddable('<div class="x">y</div>\n')).toBe('<div class="x">y</div>');
  });

  it('lifts head styles and body contents out of a document', () => {
    expect(extractEmbeddable(DOC)).toBe('<style>.card{color:red}</style>\n<div class="card">Hi</div>');
  });

  it('falls back to the whole text when a document has no body', () => {
    expect(extractEmbeddable('<!doctype html><html></html>')).toBe('<!doctype html><html></html>');
  });
});

describe('fragmentPreviewDoc', () => {
  it('applies the deals CSS to an unstyled deals fragment, for preview only', () => {
    const fragment = formatDealsSection({ response: DEALS_RESPONSE, marketplace: 'www.amazon.com', partnerTag: 't-20' }).text;
    const doc = fragmentPreviewDoc(fragment);
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain(DEALS_CSS);
    expect(doc).toContain(fragment);
    // The copied code stays the bare fragment.
    expect(extractEmbeddable(fragment)).not.toContain(DEALS_CSS);
  });

  it('does not add the deals CSS when the fragment brings its own', () => {
    const styled = formatDealsSection({
      response: DEALS_RESPONSE,
      marketplace: 'www.amazon.com',
      partnerTag: 't-20',
      includeCss: true,
    }).text;
    const doc = fragmentPreviewDoc(styled);
    expect(doc.split(DEALS_CSS)).toHaveLength(2);
  });
});
