/**
 * Pure helpers for the MCP Apps viewer: decide how to preview a tool's text
 * output, and what the "Copy HTML" button should put on the clipboard.
 *
 * Tool output comes in three shapes:
 *   - a full HTML document (`html`, `html-grid`) — previewed as-is;
 *   - an embeddable fragment (`html-deals`) — wrapped in a preview-only shell,
 *     because the fragment is meant to drop into a page that already has
 *     `<html>`/`<body>` and house CSS;
 *   - anything else (markdown, JSON, errors) — shown as escaped text.
 *
 * Kept free of DOM access so it can be unit-tested outside the iframe.
 */
import { DEALS_CSS } from '../formatters/deals-css.js';

export type OutputKind = 'document' | 'fragment' | 'text';

const DOCUMENT_MARKER = /^\s*<!doctype\s+html|^\s*<html[\s>]/i;
/** Starts with an element tag or a comment — markdown and JSON never do. */
const FRAGMENT_MARKER = /^\s*(?:<[a-z][a-z0-9-]*[\s/>]|<!--)/i;

export function classifyOutput(text: string): OutputKind {
  if (DOCUMENT_MARKER.test(text)) return 'document';
  if (FRAGMENT_MARKER.test(text)) return 'fragment';
  return 'text';
}

/**
 * The embeddable part of the output. A fragment is already embeddable, so it
 * is returned untouched. For a full document, lift the `<style>` blocks from
 * `<head>` and the `<body>` contents — the bits that paste into a CMS HTML
 * block — and drop the document scaffolding around them.
 */
export function extractEmbeddable(text: string): string {
  if (classifyOutput(text) !== 'document') return text.trim();

  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(text)?.[1] ?? '';
  const styles = head.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? [];
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(text)?.[1];
  if (body === undefined) return text.trim();

  return [...styles, body.trim()].join('\n').trim();
}

/**
 * Wrap a fragment in a document for the preview frame only. If the fragment is
 * the deals markup and carries no stylesheet of its own, apply the canonical
 * deals CSS so the preview looks like the published page — the copied code is
 * still the bare fragment, which inherits the destination's house CSS.
 */
export function fragmentPreviewDoc(fragment: string): string {
  const needsDealsCss = /class="amazon-deals-section"/.test(fragment) && !/<style[\s>]/i.test(fragment);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:12px 16px;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827;background:#fff}
    ${needsDealsCss ? DEALS_CSS : ''}
  </style></head><body>${fragment}</body></html>`;
}
