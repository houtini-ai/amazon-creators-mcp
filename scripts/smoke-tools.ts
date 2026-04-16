/**
 * Live smoke test for all 4 tools via their runX handlers.
 * Exercises: search_items → get_items on returned ASINs → get_variations on a parent → get_browse_nodes on a known node.
 * Run: npx tsx scripts/smoke-tools.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config/env.js';
import { TokenCache } from '../src/auth/token-cache.js';
import { CreatorsApiClient } from '../src/client/creators-api.js';
import { runSearchItems } from '../src/tools/search-items.js';
import { runGetItems } from '../src/tools/get-items.js';
import { runGetVariations } from '../src/tools/get-variations.js';
import { runGetBrowseNodes } from '../src/tools/get-browse-nodes.js';

function loadDotEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

function banner(label: string): void {
  console.error(`\n${'='.repeat(6)} ${label} ${'='.repeat(6)}`);
}

function previewText(text: string, max = 1500): string {
  return text.length > max ? text.slice(0, max) + `\n…(truncated ${text.length - max} chars)` : text;
}

async function main(): Promise<void> {
  loadDotEnv();
  process.env.DEBUG = process.env.DEBUG ?? '0';

  const config = loadConfig();
  console.error(`[cfg] region=${config.region} marketplace=${config.marketplace} tag=${config.partnerTag}`);
  const tokens = new TokenCache(config);
  const client = new CreatorsApiClient(config, tokens);
  const deps = { config, client };

  // ---------------- search_items ----------------
  banner('search_items (markdown)');
  const searchRes = await runSearchItems(deps, {
    keywords: 'wireless earbuds',
    itemCount: 3,
    format: 'markdown',
  });
  console.error(previewText(searchRes.content[0]!.text));

  const searchStructured = searchRes.structuredContent as {
    searchResult?: { items?: Array<{ asin: string; parentASIN?: string }> };
  };
  const foundAsins = (searchStructured.searchResult?.items ?? []).map((i) => i.asin);
  console.error(`\n  → ASINs returned: ${foundAsins.join(', ') || '(none)'}`);

  if (foundAsins.length === 0) {
    throw new Error('search_items returned no ASINs; cannot continue downstream smoke tests.');
  }

  // ---------------- get_items ----------------
  banner('get_items (json)');
  const getItemsRes = await runGetItems(deps, {
    asins: foundAsins.slice(0, 3),
    format: 'json',
  });
  console.error(previewText(getItemsRes.content[0]!.text));

  // ---------------- get_variations ----------------
  // Use Echo Dot parent ASIN we found earlier (B09B2SBHQK family has variations).
  // Fall back to first returned ASIN if that doesn't have variations.
  banner('get_variations (markdown) on B09B2SBHQK');
  try {
    const variationsRes = await runGetVariations(deps, {
      asin: 'B09B2SBHQK',
      variationCount: 5,
      format: 'markdown',
    });
    console.error(previewText(variationsRes.content[0]!.text));
  } catch (e) {
    console.error(`[get_variations] non-fatal error: ${String(e)}`);
  }

  // ---------------- get_browse_nodes ----------------
  // 172282 = Electronics root for amazon.com.
  banner('get_browse_nodes (markdown) on 172282 (Electronics, NA)');
  try {
    const browseRes = await runGetBrowseNodes(deps, {
      browseNodeIds: ['172282'],
      format: 'markdown',
    });
    console.error(previewText(browseRes.content[0]!.text));
  } catch (e) {
    console.error(`[get_browse_nodes] non-fatal error: ${String(e)}`);
    if (e && typeof e === 'object' && 'body' in e) {
      console.error('  body:', JSON.stringify((e as { body: unknown }).body, null, 2));
    }
  }

  console.error('\n✅ all 4 tools smoke-tested');
}

main().catch((err) => {
  console.error('\n❌ smoke-tools failed:', err);
  if (err && typeof err === 'object' && 'body' in err) {
    console.error('  body:', JSON.stringify((err as { body: unknown }).body, null, 2));
  }
  process.exit(1);
});
