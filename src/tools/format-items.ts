/**
 * `format_items` — re-render a previously-returned Amazon response without
 * hitting the Creators API again.
 *
 * Per project memory `project_v02_mcp_ui_goal.md` design constraint #4:
 *   > Add a way to re-render without re-querying Amazon … otherwise 20 style
 *   > iterations = 20 Amazon calls = rate-limit risk + slow loop.
 *
 * Usage pattern:
 *   1. User calls `search_items` / `get_items` / `get_variations` once —
 *      gets back `structuredContent` (the raw response envelope).
 *   2. Claude asks the user: "what do you want to tweak?"
 *   3. For each tweak, Claude calls `format_items` with the same
 *      `structuredContent` + a new `customStyles` block. Zero Amazon calls.
 *
 * `items[]` below accepts the full response envelope (what the other tools
 * returned as `structuredContent`). We don't require the user to un-nest it.
 */
import { z } from 'zod';
import { formatGetItemsMarkdown } from '../formatters/markdown.js';
import type { GetItemsResponse } from '../types/creators.js';
import { extractItems } from '../formatters/html.js';
import type {
  SearchItemsResponse,
  GetItemsResponse as TGetItemsResponse,
  GetVariationsResponse,
  Item,
} from '../types/creators.js';
import {
  customStylesSchema,
  formatSchema,
  hideItemsWithoutPriceSchema,
  renderToolOutput,
  titleMaxCharsSchema,
  type ToolDeps,
} from './shared.js';

export const FORMAT_ITEMS_TOOL_NAME = 'format_items';

export const FORMAT_ITEMS_DESCRIPTION =
  "Re-render Amazon items you already have (from a previous `search_items`, `get_items`, or `get_variations` call) without hitting the API again. Pass the exact `structuredContent` you received back as `response`, or pass `items` directly as an array. This tool IS for producing HTML embeds — the user has by this point explicitly asked for a card/grid/preview. Use it specifically when iterating on `customStyles` (\"make the border hotpink\", \"dark mode\", \"bigger price\") — it avoids rate-limit pressure and is much faster than re-querying Amazon.";

export const formatItemsShape = {
  response: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Raw response envelope previously returned in `structuredContent` by search_items / get_items / get_variations. Pass this OR `items`.",
    ),
  items: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe('Alternative to `response`: an array of Item objects.'),
  format: formatSchema,
  customStyles: customStylesSchema,
  titleMaxChars: titleMaxCharsSchema,
  hideItemsWithoutPrice: hideItemsWithoutPriceSchema,
  retrievedAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      'ISO-8601 timestamp marking when the original response was fetched from Amazon. Rendered next to the price as "as of <ts>". If omitted, defaults to now — but you should pass the original fetch time when re-rendering old data so the displayed timestamp stays truthful.',
    ),
};

export const formatItemsInput = z.object(formatItemsShape);

export type FormatItemsInput = z.infer<typeof formatItemsInput>;

/**
 * Coerce whatever the user passed into `{ itemsResult: { items } }` so downstream
 * formatters can treat it uniformly. Accepts:
 *   - a full searchResult/itemsResult/variationsResult envelope as `response`
 *   - a flat `items[]` array
 */
function normaliseToItemsResponse(input: FormatItemsInput): GetItemsResponse {
  if (input.items && input.items.length > 0) {
    return { itemsResult: { items: input.items as unknown as Item[] } };
  }
  if (input.response) {
    const items = extractItems(
      input.response as unknown as SearchItemsResponse | TGetItemsResponse | GetVariationsResponse,
    );
    return { itemsResult: { items } };
  }
  throw new Error('format_items requires either `response` (an envelope) or `items` (an array).');
}

export async function runFormatItems(deps: ToolDeps, input: FormatItemsInput) {
  const normalised = normaliseToItemsResponse(input);
  return renderToolOutput({
    format: input.format,
    response: normalised,
    partnerTag: deps.config.partnerTag,
    marketplace: deps.config.marketplace,
    customStyles: input.customStyles,
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    titleMaxChars: input.titleMaxChars,
    hideItemsWithoutPrice: input.hideItemsWithoutPrice,
    markdownFormatter: formatGetItemsMarkdown,
  });
}
