/**
 * Tiny preview server for eyeballing html-card / html-grid output in the
 * Claude Preview MCP. Imports the built formatters directly and serves a
 * fixed fixture — NO Amazon calls. Routes:
 *   /        → html-card (single item)
 *   /grid    → html-grid (four items)
 *   /dark    → html-card with dark customStyles
 */
import { createServer } from 'node:http';
import { formatHtmlCard, formatHtmlGrid } from '../dist/formatters/html.js';

const PORT = Number(process.env.PREVIEW_PORT ?? 4173);

const ITEMS = [
  {
    asin: 'B09B2SBHQK',
    detailPageURL: 'https://www.amazon.com/dp/B09B2SBHQK?tag=demo-20&linkCode=osi',
    itemInfo: {
      title: { displayValue: 'Echo Show 5 (3rd Gen) — Charcoal', label: 'Title' },
      byLineInfo: { brand: { displayValue: 'Amazon' } },
      features: { displayValues: ['Compact 5.5" smart display with Alexa', 'Watch recipes, news, and security cameras'] },
    },
    images: { primary: { large: { url: 'https://m.media-amazon.com/images/I/71-ARH7LHML._AC_SL1500_.jpg', width: 500, height: 500 } } },
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
    customerReviews: { starRating: { value: 4.6 }, count: 53821 },
  },
  {
    asin: 'B08N5WRWNW',
    detailPageURL: 'https://www.amazon.com/dp/B08N5WRWNW?tag=demo-20&linkCode=osi',
    itemInfo: {
      title: { displayValue: 'Echo Dot (5th Gen) — Deep Sea Blue', label: 'Title' },
      byLineInfo: { brand: { displayValue: 'Amazon' } },
    },
    images: { primary: { large: { url: 'https://m.media-amazon.com/images/I/71xoR4A6q-L._AC_SL1000_.jpg', width: 500, height: 500 } } },
    offersV2: {
      listings: [{ isBuyBoxWinner: true, price: { money: { amount: 49.99, currency: 'USD', displayAmount: '$49.99' } } }],
    },
    customerReviews: { starRating: { value: 4.7 }, count: 987654 },
  },
  {
    asin: 'B09ZXJ5JFH',
    detailPageURL: 'https://www.amazon.com/dp/B09ZXJ5JFH?tag=demo-20&linkCode=osi',
    itemInfo: {
      title: { displayValue: 'Fire TV Stick 4K Max', label: 'Title' },
      byLineInfo: { brand: { displayValue: 'Amazon' } },
    },
    images: { primary: { large: { url: 'https://m.media-amazon.com/images/I/51TpFJzxqdL._AC_SL1000_.jpg', width: 500, height: 500 } } },
    offersV2: {
      listings: [{ isBuyBoxWinner: true, price: { money: { amount: 59.99, currency: 'USD', displayAmount: '$59.99' } } }],
    },
    customerReviews: { starRating: { value: 4.7 }, count: 321654 },
  },
  {
    asin: 'B08F7N5LCD',
    detailPageURL: 'https://www.amazon.com/dp/B08F7N5LCD?tag=demo-20&linkCode=osi',
    itemInfo: {
      title: { displayValue: 'Kindle Paperwhite (11th Generation)', label: 'Title' },
      byLineInfo: { brand: { displayValue: 'Amazon' } },
    },
    images: { primary: { large: { url: 'https://m.media-amazon.com/images/I/61IBBVJvSDL._AC_SL1000_.jpg', width: 500, height: 500 } } },
    offersV2: {
      listings: [{ isBuyBoxWinner: true, price: { money: { amount: 139.99, currency: 'USD', displayAmount: '$139.99' } } }],
    },
    customerReviews: { starRating: { value: 4.6 }, count: 234890 },
  },
];

const RESPONSE = { searchResult: { items: ITEMS, totalResultCount: ITEMS.length } };

function render(route) {
  const shared = { response: RESPONSE, partnerTag: 'demo-20', marketplace: 'www.amazon.com' };
  if (route === '/grid') return formatHtmlGrid(shared).text;
  if (route === '/dark') {
    return formatHtmlCard({
      ...shared,
      customStyles: `
        .amzn-card { background:#0f172a; color:#f1f5f9; border-color:#1e293b; }
        .amzn-card__title { color:#f8fafc; }
        .amzn-card__meta, .amzn-card__brand, .amzn-card__rating { color:#cbd5e1; }
        .amzn-card__price { color:#fbbf24; }
        .amzn-card__cta { background:hotpink; color:#0f172a; }
        .amzn-card__disclosure { color:#94a3b8; }
      `,
    }).text;
  }
  return formatHtmlCard(shared).text;
}

function indexPage() {
  return `<!doctype html><meta charset="utf-8"><title>amazon-creators preview</title>
  <body style="font-family:system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#111">
    <h1>amazon-creators-mcp preview</h1>
    <ul>
      <li><a href="/card">html-card (default styles)</a></li>
      <li><a href="/dark">html-card (customStyles — dark + hotpink CTA)</a></li>
      <li><a href="/grid">html-grid (4 items)</a></li>
    </ul>
  </body>`;
}

createServer((req, res) => {
  try {
    const url = req.url ?? '/';
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(indexPage());
      return;
    }
    const route = url === '/card' ? '/' : url;
    const html = render(route);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(err && err.stack ? err.stack : err));
  }
}).listen(PORT, () => {
  console.log(`preview server listening on http://localhost:${PORT}`);
});
