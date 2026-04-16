/**
 * Regression guard for the MCP Apps discovery contract.
 *
 * Every tool that produces renderable output MUST carry
 * `_meta.ui.resourceUri` pointing at our viewer resource, and that
 * resource MUST be registered with the server. If either side drifts,
 * MCP Apps-capable hosts (Claude Desktop) silently stop rendering the
 * inline preview — no error, just a plain-text fallback — which is a
 * bug that would take a human eye to catch without this test.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { buildServer } from '../../src/server.js';
import {
  VIEWER_RESOURCE_URI,
  AMAZON_IMAGE_ORIGINS,
  buildViewerContents,
} from '../../src/mcp-apps/register.js';

// MSW is shared with the other integration tests — no real network is
// required here because buildServer() doesn't call Amazon on init.
const mswServer = setupServer();
beforeAll(() => {
  // Provide env buildServer needs — values don't matter, registration is
  // synchronous and offline.
  process.env.AMAZON_CLIENT_ID = 'x';
  process.env.AMAZON_CLIENT_SECRET = 'y';
  process.env.AMAZON_PARTNER_TAG = 't-20';
  process.env.AMAZON_CREDENTIAL_VERSION = '3.1';
  process.env.AMAZON_MARKETPLACE = 'www.amazon.com';
  mswServer.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

// The McpServer SDK doesn't expose a public registry inspector, but does
// keep maps under conventional private field names. Narrow the shape here
// so a future SDK rename fails loud rather than silently.
type RegisteredMap = Record<string, { _meta?: Record<string, unknown> }>;
function asInternal(s: unknown): {
  _registeredTools: RegisteredMap;
  _registeredResources: Record<string, unknown>;
} {
  return s as {
    _registeredTools: RegisteredMap;
    _registeredResources: Record<string, unknown>;
  };
}

describe('MCP Apps registration', () => {
  it('every tool carries _meta.ui.resourceUri pointing at the viewer', () => {
    const server = buildServer();
    const { _registeredTools: tools } = asInternal(server);

    const expectedTools = [
      'search_items',
      'get_items',
      'get_variations',
      'get_browse_nodes',
      'format_items',
    ];

    for (const name of expectedTools) {
      const tool = tools[name];
      expect(tool, `tool "${name}" not registered`).toBeDefined();
      const meta = tool!._meta ?? {};
      const ui = meta.ui as { resourceUri?: string } | undefined;
      expect(ui?.resourceUri, `tool "${name}" missing _meta.ui.resourceUri`).toBe(
        VIEWER_RESOURCE_URI,
      );
      // ext-apps also mirrors to the legacy key for older hosts — keep the
      // pairing so hosts that only know the old key still find us.
      expect(meta['ui/resourceUri']).toBe(VIEWER_RESOURCE_URI);
    }
  });

  it('viewer resource is registered at the URI tools point at', () => {
    const server = buildServer();
    const { _registeredResources: resources } = asInternal(server);
    expect(Object.keys(resources)).toContain(VIEWER_RESOURCE_URI);
  });

  it('viewer contents carry _meta.ui.csp allowlist for Amazon image CDNs', () => {
    // Critical for Claude Desktop image rendering — without this the webview
    // CSP blocks `<img src="https://m.media-amazon.com/...">` and cards
    // render with broken image placeholders. See `register.ts` for the full
    // rationale. This test guards against silent removal of the _meta block
    // during future refactors.
    // Dummy html avoids needing `npm run build` to have run before tests.
    const { contents } = buildViewerContents('<!doctype html><html></html>');
    expect(contents).toHaveLength(1);
    const csp = contents[0]!._meta.ui.csp;
    // Every Amazon image origin we allowlist must appear in both slots.
    for (const origin of AMAZON_IMAGE_ORIGINS) {
      expect(csp.resourceDomains).toContain(origin);
      expect(csp.connectDomains).toContain(origin);
    }
    // `m.media-amazon.com` is the modern primary — catch regressions where
    // someone removes it thinking it's "legacy" (it isn't).
    expect(csp.resourceDomains).toContain('https://m.media-amazon.com');
  });
});
