/**
 * Client-side bootstrap for the MCP Apps viewer iframe.
 *
 * This runs INSIDE the sandbox iframe that Claude Desktop (or any MCP Apps
 * host) spawns when one of our tools returns. It connects to the host via
 * postMessage, listens for `ui/notifications/tool-result`, and renders the
 * tool's HTML (or markdown/json fallback) inside a nested same-origin iframe
 * so the rendered content's CSS can't leak into — or read from — our shell.
 *
 * Why a nested iframe with `srcdoc` rather than `document.write`:
 *   `document.write` destroys the top-level DOM, which kills the `App`
 *   instance and its auto-resize hooks. The nested-iframe approach keeps the
 *   App alive so the host still gets size-change notifications and a clean
 *   teardown.
 *
 * Bundled into a single HTML file at build time by `scripts/build-viewer.mjs`
 * using esbuild; the output lives at `dist/mcp-apps/viewer.html` and is
 * served by `registerAppResource` at runtime.
 */
import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps';

type ContentBlock = { type: string; text?: string } & Record<string, unknown>;
type ToolResult = {
  content?: ContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const HTML_MARKER = /^\s*<!doctype\s+html|^\s*<html[\s>]/i;

/**
 * Target preview dimensions. Claude Desktop's MCP Apps preview slot is
 * approximately 880×245 — confirmed empirically 2026-04-16 by user testing.
 * Product cards often render taller than this (portrait image + stacked
 * metadata + CTA + disclosure ≈ 400–600 px tall), so we let the nested
 * iframe scroll internally rather than asking the host to grow the panel.
 * These constants must match the CSS in viewer-template.html.
 */
const VIEWER_WIDTH = 880;
const VIEWER_HEIGHT = 245;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fallbackDoc(text: string, isError: boolean): string {
  // Used when the tool returned markdown or JSON rather than a complete
  // HTML document — just display it readably so the preview never looks
  // blank for non-HTML formats.
  const color = isError ? '#b91c1c' : '#111827';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:16px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:${color};background:#fafafa}
    pre{margin:0;white-space:pre-wrap;word-break:break-word}
  </style></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
}

function emptyDoc(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:24px;font:14px/1.5 system-ui;color:#6b7280;text-align:center}
  </style></head><body>${escapeHtml(message)}</body></html>`;
}

/** Render a tool result into the preview frame. */
function render(params: ToolResult): void {
  const frame = document.getElementById('preview') as HTMLIFrameElement | null;
  if (!frame) return;

  const first = params.content?.find((c) => c.type === 'text');
  const text = typeof first?.text === 'string' ? first.text : '';
  const isError = params.isError === true;

  if (!text) {
    frame.srcdoc = emptyDoc(isError ? 'Tool reported an error (no content).' : 'No content returned.');
    return;
  }

  frame.srcdoc = HTML_MARKER.test(text) ? text : fallbackDoc(text, isError);
}

async function main(): Promise<void> {
  // `autoResize: false` — we explicitly pin the preview to VIEWER_WIDTH ×
  // VIEWER_HEIGHT rather than letting the ResizeObserver report every
  // content reflow to the host. The host's preview slot is a fixed size and
  // ballooning it (the default autoResize behaviour) looks bad — tall cards
  // would push other UI around. Internal scrolling on the nested iframe
  // keeps oversize content accessible without affecting the host layout.
  const app = new App(
    { name: 'amazon-creators-viewer', version: '0.3.0' },
    {},
    { autoResize: false },
  );

  // Register handlers BEFORE connect() — the host may send the tool-result
  // notification the moment the handshake completes.
  app.ontoolresult = (params) => render(params as ToolResult);

  // Some hosts re-send the initial result after a teardown/redisplay; treat
  // it idempotently.
  app.onteardown = async () => ({});

  try {
    await app.connect(new PostMessageTransport(window.parent, window.parent));
    // Explicitly pin our requested size. Fires once after the handshake so
    // the host knows the dimensions without waiting for content to arrive.
    // Failures here are non-fatal — the host already has a default slot.
    app.sendSizeChanged({ width: VIEWER_WIDTH, height: VIEWER_HEIGHT }).catch(() => {
      /* host may ignore; default slot is fine */
    });
  } catch (err) {
    // If the handshake fails we have no path to surface the error to the
    // host; render it inline so the developer sees something useful.
    render({
      content: [{ type: 'text', text: `[viewer] connect failed: ${String(err)}` }],
      isError: true,
    });
  }
}

void main();
