import { z } from 'zod';
import { formatGetItemsMarkdown } from '../formatters/markdown.js';
import type { GetItemsResponse } from '../types/creators.js';
import {
  customStylesSchema,
  DEFAULT_ITEM_RESOURCES,
  formatSchema,
  hideItemsWithoutPriceSchema,
  renderToolOutput,
  resourcesSchema,
  titleMaxCharsSchema,
  type ToolDeps,
} from './shared.js';

export const GET_ITEMS_TOOL_NAME = 'get_items';

export const GET_ITEMS_DESCRIPTION =
  "Look up 1–10 ASINs on Amazon. IMPORTANT: the returned `items` array is NOT guaranteed to be in the same order as the input `asins` array — always match items to inputs by the `asin` field, not by index. Invalid or inaccessible ASINs appear in a separate `errors` array rather than in `items` — check both.\n\nPRESENTATION GUIDANCE (important): default to `format: 'markdown'` or `format: 'json'`. After the tool returns, summarise conversationally (e.g. \"Here's what I found for those 3 ASINs: • Echo Show 5 ($79.99) • Kindle Paperwhite ($139.99) …\") — DO NOT paste the raw tool output. Then ASK the user whether they'd like an **embeddable HTML card/grid** before calling the tool again with an HTML format. Only use `format: 'html-card'` or `format: 'html-grid'` when the user has *explicitly* asked for a preview, card, widget, embed, or paste-ready HTML.";

const ASIN_RE = /^[A-Z0-9]{10}$/;

export const getItemsShape = {
  asins: z
    .array(z.string().regex(ASIN_RE, 'Each ASIN must be 10 chars of A-Z0-9.'))
    .min(1)
    .max(10)
    .describe('1–10 Amazon ASINs.'),
  condition: z.enum(['Any', 'Collectible', 'New', 'Refurbished', 'Used']).optional(),
  merchant: z.enum(['All', 'Amazon']).optional(),
  languagesOfPreference: z.array(z.string()).optional(),
  offerCount: z.number().int().min(1).max(10).optional().describe('How many offers per item (max 10).'),
  resources: resourcesSchema,
  format: formatSchema,
  customStyles: customStylesSchema,
  titleMaxChars: titleMaxCharsSchema,
  hideItemsWithoutPrice: hideItemsWithoutPriceSchema,
};

export const getItemsInput = z.object(getItemsShape);

export type GetItemsInput = z.infer<typeof getItemsInput>;

export function buildGetItemsPayload(input: GetItemsInput, partnerTag: string, marketplace: string): Record<string, unknown> {
  const {
    asins,
    resources,
    format: _format,
    customStyles: _customStyles,
    titleMaxChars: _titleMaxChars,
    hideItemsWithoutPrice: _hideItemsWithoutPrice,
    ...rest
  } = input;
  return {
    ...rest,
    itemIds: asins,
    itemIdType: 'ASIN',
    resources: resources ?? DEFAULT_ITEM_RESOURCES,
    partnerTag,
    partnerType: 'Associates',
    marketplace,
  };
}

export async function runGetItems(deps: ToolDeps, input: GetItemsInput) {
  const payload = buildGetItemsPayload(input, deps.config.partnerTag, deps.config.marketplace);
  const response = await deps.client.call<GetItemsResponse>('getItems', payload);
  return renderToolOutput({
    format: input.format,
    response,
    partnerTag: deps.config.partnerTag,
    marketplace: deps.config.marketplace,
    customStyles: input.customStyles,
    retrievedAt: new Date().toISOString(),
    titleMaxChars: input.titleMaxChars,
    hideItemsWithoutPrice: input.hideItemsWithoutPrice,
    markdownFormatter: formatGetItemsMarkdown,
  });
}
