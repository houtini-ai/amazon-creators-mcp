/**
 * Helper to register the shared MCP Apps viewer resource on an `McpServer`.
 *
 * All 5 tools point their `_meta.ui.resourceUri` at the same viewer URI —
 * the viewer inspects each tool's result content and renders whatever
 * format came back (HTML doc, markdown, JSON). Registering one resource
 * means hosts only fetch the bundled HTML once per session.
 *
 * ## CSP whitelisting for Amazon image CDNs
 *
 * Claude Desktop (and any MCP Apps-compliant host) renders `ui://` resources
 * inside a sandboxed webview with a restrictive default CSP — by design, so
 * third-party content can't exfiltrate data or load untrusted scripts. The
 * product-card HTML we emit references images on Amazon's CDN
 * (`m.media-amazon.com` and the legacy regional `*-ssl-images-amazon.com`
 * hosts); without an explicit hint these image loads are CSP-blocked and the
 * cards render with broken image placeholders.
 *
 * The MCP Apps spec exposes a `_meta.ui.csp` hint on resource contents that
 * the host can honour to extend its CSP allowlist for THAT resource only.
 * We set `resourceDomains` (covers `img-src` / `media-src` / `style-src-elem`)
 * and `connectDomains` (covers `connect-src`, so a future version could do
 * runtime image fetches from the viewer client if needed).
 *
 * Pattern borrowed from `gemini-mcp`'s `register-viewers.ts`, which uses the
 * same mechanism to whitelist its local media server origin. Verified working
 * in Claude Desktop as of 2026-04-16.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { VIEWER_RESOURCE_URI, VIEWER_RESOURCE_NAME, getViewerHtml } from './viewer.js';

export { VIEWER_RESOURCE_URI, VIEWER_RESOURCE_NAME };

/**
 * Origins the viewer iframe is allowed to load images from.
 *
 * `m.media-amazon.com` is the modern unified Amazon CDN returned by the
 * Creators API in 2026. The three `images-{na,eu,fe}.ssl-images-amazon.com`
 * hosts are the pre-2020 regional CDNs — Amazon still serves a small number
 * of responses from them, so we allowlist all four to avoid intermittent
 * broken-image cards.
 */
export const AMAZON_IMAGE_ORIGINS = [
  'https://m.media-amazon.com',
  'https://images-na.ssl-images-amazon.com',
  'https://images-eu.ssl-images-amazon.com',
  'https://images-fe.ssl-images-amazon.com',
] as const;

/**
 * Build the `resources/read` response contents for the viewer, including the
 * `_meta.ui.csp` allowlist that lets the webview load Amazon CDN images.
 *
 * Extracted from `registerViewerResource` so tests can assert on the exact
 * shape without reaching into the McpServer's private handler registry. The
 * `html` parameter defaults to the bundled viewer — tests pass a dummy so
 * they don't need a full `npm run build` between edits and test runs.
 */
export function buildViewerContents(html?: string): {
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
    _meta: { ui: { csp: { resourceDomains: string[]; connectDomains: string[] } } };
  }>;
} {
  return {
    contents: [
      {
        uri: VIEWER_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: html ?? getViewerHtml(),
        _meta: {
          ui: {
            csp: {
              resourceDomains: [...AMAZON_IMAGE_ORIGINS],
              connectDomains: [...AMAZON_IMAGE_ORIGINS],
            },
          },
        },
      },
    ],
  };
}

/** Register the viewer at `ui://amazon-creators/viewer.html`. */
export function registerViewerResource(server: McpServer): void {
  registerAppResource(
    server,
    VIEWER_RESOURCE_NAME,
    VIEWER_RESOURCE_URI,
    {
      description:
        'Sandboxed renderer for Amazon Creators tool output — displays the HTML card/grid (or falls back to the raw markdown/JSON) inside a nested iframe.',
    },
    () => buildViewerContents(),
  );
}
