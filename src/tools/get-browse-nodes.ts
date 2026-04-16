import { z } from 'zod';
import { formatGetBrowseNodesMarkdown } from '../formatters/markdown.js';
import { formatJson } from '../formatters/json.js';
import type { GetBrowseNodesResponse } from '../types/creators.js';
import {
  browseNodeFormatSchema,
  browseNodeResourcesSchema,
  DEFAULT_BROWSE_RESOURCES,
  toMcpResult,
  type ToolDeps,
} from './shared.js';

export const GET_BROWSE_NODES_TOOL_NAME = 'get_browse_nodes';

export const GET_BROWSE_NODES_DESCRIPTION =
  "Returns browse-node metadata (category tree) for up to 10 IDs — ancestor chain and direct children for each node. Use the `browseNodeInfo.websiteSalesRank` resource to find top-selling categories. Supports `markdown` and `json` output; HTML product-card formats don't apply here.";

export const getBrowseNodesShape = {
  browseNodeIds: z.array(z.string().min(1)).min(1).max(10).describe('1–10 browse-node IDs.'),
  languagesOfPreference: z.array(z.string()).optional(),
  resources: browseNodeResourcesSchema,
  format: browseNodeFormatSchema,
};

export const getBrowseNodesInput = z.object(getBrowseNodesShape);

export type GetBrowseNodesInput = z.infer<typeof getBrowseNodesInput>;

export function buildGetBrowseNodesPayload(input: GetBrowseNodesInput, partnerTag: string, marketplace: string): Record<string, unknown> {
  const { resources, format: _format, ...rest } = input;
  return {
    ...rest,
    resources: resources ?? DEFAULT_BROWSE_RESOURCES,
    partnerTag,
    partnerType: 'Associates',
    marketplace,
  };
}

export async function runGetBrowseNodes(deps: ToolDeps, input: GetBrowseNodesInput) {
  const payload = buildGetBrowseNodesPayload(input, deps.config.partnerTag, deps.config.marketplace);
  const response = await deps.client.call<GetBrowseNodesResponse>('getBrowseNodes', payload);
  const formatterInput = {
    response,
    partnerTag: deps.config.partnerTag,
    marketplace: deps.config.marketplace,
  };
  const out = input.format === 'json' ? formatJson(formatterInput) : formatGetBrowseNodesMarkdown(formatterInput);
  return toMcpResult(out);
}
