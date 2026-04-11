import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  NotionAppendBlocksInputSchema,
  NotionAppendBlocksOutputSchema,
  NOTION_API_BASE,
  buildNotionHeaders,
  formatNotionError,
  type NotionAppendBlocksInput,
  type NotionAppendBlocksOutput,
} from './schemas.js';

export {
  NotionAppendBlocksInputSchema,
  NotionAppendBlocksOutputSchema,
  type NotionAppendBlocksInput,
  type NotionAppendBlocksOutput,
} from './schemas.js';

interface NotionAppendBlocksResponse {
  results: Array<{ id: string; [key: string]: unknown }>;
}

interface NotionErrorResponse {
  code?: string;
  message?: string;
  status?: number;
}

export const notionAppendBlocksNode = defineNode({
  type: 'notion_append_blocks',
  name: 'Notion Append Blocks',
  description: 'Append child blocks to a Notion page or parent block (Notion caps at 100 blocks per request).',
  category: 'integration',
  inputSchema: NotionAppendBlocksInputSchema,
  outputSchema: NotionAppendBlocksOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },

  executor: async (input: NotionAppendBlocksInput, context) => {
    try {
      const apiToken = context.credentials?.notion?.apiToken as string | undefined;
      if (!apiToken) {
        return {
          success: false,
          error:
            'Notion API token not configured. Please provide context.credentials.notion.apiToken.',
        };
      }

      const body: Record<string, unknown> = {
        children: input.children,
      };
      if (input.after !== undefined) body.after = input.after;

      const response = await fetchWithRetry(
        `${NOTION_API_BASE}/blocks/${encodeURIComponent(input.blockId)}/children`,
        {
          method: 'PATCH',
          headers: buildNotionHeaders(apiToken),
          body: JSON.stringify(body),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({}))) as NotionErrorResponse;
        const code = errorData.code ?? 'unknown_error';
        const message = errorData.message ?? response.statusText;
        return {
          success: false,
          error: `Notion API error ${response.status} (${code}): ${message}`,
        };
      }

      const data = (await response.json()) as NotionAppendBlocksResponse;

      const output: NotionAppendBlocksOutput = {
        appendedBlockIds: data.results.map((block) => block.id),
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: formatNotionError(error, 'Failed to append Notion blocks'),
      };
    }
  },
});
