/**
 * Live smoke test: verifies OAuth token fetch + one searchItems call against the real API.
 * Run: npx tsx scripts/smoke-auth.ts
 * Reads .env from project root manually (intentionally — this repo does not pull dotenv as a runtime dep).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config/env.js';
import { TokenCache } from '../src/auth/token-cache.js';
import { CreatorsApiClient } from '../src/client/creators-api.js';

function loadDotEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (err) {
    console.error(`[smoke] could not load .env: ${String(err)}`);
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  process.env.DEBUG = process.env.DEBUG ?? '1';

  console.error('\n=== smoke-auth.ts ===');
  console.error('Step 1: load config');
  const cfg = loadConfig();
  console.error(
    `  region=${cfg.region} marketplace=${cfg.marketplace} ` +
      `version=${cfg.credentialVersion} tag=${cfg.partnerTag}`,
  );

  console.error('\nStep 2: fetch OAuth token');
  const tokens = new TokenCache(cfg);
  const token = await tokens.getToken();
  console.error(`  got token (len=${token.length}, prefix=${token.slice(0, 24)}…)`);

  console.error('\nStep 3: second getToken() should return cached value');
  const cached = await tokens.getToken();
  console.error(`  cached match=${cached === token}`);

  console.error('\nStep 4: live searchItems call (keywords="echo dot", itemCount=3)');
  const client = new CreatorsApiClient(cfg, tokens);
  const result = await client.call('searchItems', {
    keywords: 'echo dot',
    itemCount: 3,
    partnerTag: cfg.partnerTag,
    partnerType: 'Associates',
    marketplace: cfg.marketplace,
    resources: [
      'itemInfo.title',
      'images.primary.medium',
      'offersV2.listings.price',
    ],
  });

  console.error('\nStep 5: response preview');
  const preview = JSON.stringify(result, null, 2);
  console.error(preview.length > 4000 ? preview.slice(0, 4000) + '\n…(truncated)' : preview);

  console.error('\n✅ smoke test passed');
}

main().catch((err) => {
  console.error('\n❌ smoke test failed:', err);
  if (err && typeof err === 'object' && 'body' in err) {
    console.error('  body:', JSON.stringify((err as { body: unknown }).body, null, 2));
  }
  process.exit(1);
});
