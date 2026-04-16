import { z } from 'zod';
import { formatGetVariationsMarkdown } from '../formatters/markdown.js';
import type { GetVariationsResponse } from '../types/creators.js';
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

export const GET_VARIATIONS_TOOL_NAME = 'get_variations';

export const GET_VARIATIONS_DESCRIPTION =
  "List colour/size/style variations of a parent ASIN. Max 10 variations per call; paginate via `variationPage` (1–10). Pass the parent ASIN of a product that has variants — non-variant products return an empty result.\n\nPRESENTATION GUIDANCE (important): default to `format: 'markdown'` or `format: 'json'`. Summarise the variations conversationally (e.g. \"The Echo Show 5 comes in 3 colours: • Charcoal ($79.99) • Glacier White ($79.99) • Deep Sea Blue ($84.99)\") — DO NOT paste the raw tool output. Then ASK the user whether they'd like an **embeddable HTML grid** of the variations for their blog. Only use `format: 'html-card'` or `format: 'html-grid'` when the user has *explicitly* asked for a preview, card, widget, embed, or paste-ready HTML.";

const ASIN_RE = /^[A-Z0-9]{10}$/;

export const getVariationsShape = {
  asin: z.string().regex(ASIN_RE, 'ASIN must be 10 chars of A-Z0-9.').describe('Parent ASIN whose variations to list.'),
  variationCount: z.number().int().min(1).max(10).optional().describe('Variations per page (max 10).'),
  variationPage: z.number().int().min(1).max(10).optional().describe('Page number (1-10).'),
  condition: z.enum(['Any', 'Collectible', 'New', 'Refurbished', 'Used']).optional(),
  merchant: z.enum(['All', 'Amazon']).optional(),
  languagesOfPreference: z.array(z.string()).optional(),
  offerCount: z.number().int().min(1).max(10).optional(),
  resources: resourcesSchema,
  format: formatSchema,
  customStyles: customStylesSchema,
  titleMaxChars: titleMaxCharsSchema,
  hideItemsWithoutPrice: hideItemsWithoutPriceSchema,
};

export const getVariationsInput = z.object(getVariationsShape);

export type GetVariationsInput = z.infer<typeof getVariationsInput>;

export function buildGetVariationsPayload(input: GetVariationsInput, partnerTag: string, marketplace: string): Record<string, unknown> {
  const {
    asin,
    resources,
    format: _format,
    customStyles: _customStyles,
    titleMaxChars: _titleMaxChars,
    hideItemsWithoutPrice: _hideItemsWithoutPrice,
    ...rest
  } = input;
  return {
    ...rest,
    asin,
    resources: resources ?? DEFAULT_ITEM_RESOURCES,
    partnerTag,
    partnerType: 'Associates',
    marketplace,
  };
}

export async function runGetVariations(deps: ToolDeps, input: GetVariationsInput) {
  const payload = buildGetVariationsPayload(input, deps.config.partnerTag, deps.config.marketplace);
  const response = await deps.client.call<GetVariationsResponse>('getVariations', payload);
  return renderToolOutput({
    format: input.format,
    response,
    partnerTag: deps.config.partnerTag,
    marketplace: deps.config.marketplace,
    customStyles: input.customStyles,
    retrievedAt: new Date().toISOString(),
    titleMaxChars: input.titleMaxChars,
    hideItemsWithoutPrice: input.hideItemsWithoutPrice,
    markdownFormatter: formatGetVariationsMarkdown,
  });
}
