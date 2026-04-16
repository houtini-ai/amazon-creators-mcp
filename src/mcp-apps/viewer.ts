/**
 * Loader for the pre-bundled MCP Apps viewer HTML.
 *
 * The bundle is produced by `scripts/build-viewer.mjs` (esbuild inlines
 * `@modelcontextprotocol/ext-apps/app-with-deps` plus our
 * `viewer-client.ts`) and written to `dist/mcp-apps/viewer.html` — right
 * next to this module's compiled output. We read it lazily at runtime and
 * cache it for the life of the process.
 *
 * The URI exported here (`VIEWER_RESOURCE_URI`) is what every tool's
 * `_meta.ui.resourceUri` points at and what `registerAppResource`
 * registers. One viewer, all 5 tools — the viewer just renders whatever
 * HTML (or text fallback) the tool returns.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Canonical URI for the MCP Apps viewer resource. */
export const VIEWER_RESOURCE_URI = 'ui://amazon-creators/viewer.html';

/** Human-readable name used in `registerAppResource` metadata. */
export const VIEWER_RESOURCE_NAME = 'Amazon Creators preview';

let cachedHtml: string | null = null;

/**
 * Load and return the bundled viewer HTML. Cached after first call.
 * Throws with a clear message if the build step hasn't run — this is the
 * usual cause of a missing viewer during `npm link` / fresh clones.
 */
export function getViewerHtml(): string {
  if (cachedHtml !== null) return cachedHtml;
  const url = new URL('./viewer.html', import.meta.url);
  try {
    cachedHtml = readFileSync(fileURLToPath(url), 'utf-8');
    return cachedHtml;
  } catch (err) {
    throw new Error(
      `[amazon-creators-mcp] viewer bundle missing at ${url.pathname}. ` +
        `Run \`npm run build\` (which invokes scripts/build-viewer.mjs) ` +
        `before starting the server. Underlying error: ${String(err)}`,
    );
  }
}
