#!/usr/bin/env node
/**
 * Build step: bundle `src/mcp-apps/viewer-client.ts` (plus its full
 * `@modelcontextprotocol/ext-apps` dependency tree) into one IIFE JS blob
 * and splice it into `src/mcp-apps/viewer-template.html`. Output:
 * `dist/mcp-apps/viewer.html` — a single self-contained HTML document that
 * `registerAppResource` serves at `ui://amazon-creators/viewer.html`.
 *
 * Runs before `tsc` as part of `npm run build`. Kept in plain ESM .mjs so
 * it has no TypeScript dependency of its own.
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const ENTRY = resolve(ROOT, 'src/mcp-apps/viewer-client.ts');
const TEMPLATE = resolve(ROOT, 'src/mcp-apps/viewer-template.html');
const OUT_HTML = resolve(ROOT, 'dist/mcp-apps/viewer.html');

async function main() {
  // Bundle the viewer client as an IIFE — no exports escape, all deps
  // inlined, runs as a top-level side effect when the <script> parses.
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: 'iife',
    target: ['es2022'],
    platform: 'browser',
    // Minify aggressively — this ships inside every tool-render response.
    minify: true,
    // Drop node-isms that the bundled ext-apps might pull in defensively.
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    legalComments: 'none',
    logLevel: 'warning',
  });

  const js = result.outputFiles[0].text;
  const template = await readFile(TEMPLATE, 'utf-8');
  const html = template.replace('/* __VIEWER_CLIENT__ */', () => js);

  await mkdir(dirname(OUT_HTML), { recursive: true });
  await writeFile(OUT_HTML, html, 'utf-8');

  const kb = (html.length / 1024).toFixed(1);
  // eslint-disable-next-line no-console
  console.log(`[build-viewer] wrote ${OUT_HTML} (${kb} kB)`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[build-viewer] failed:', err);
  process.exit(1);
});
