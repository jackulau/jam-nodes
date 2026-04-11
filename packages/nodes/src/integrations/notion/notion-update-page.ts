import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  NotionUpdatePageInputSchema,
  NotionUpdatePageOutputSchema,
  NOTION_API_BASE,
  buildNotionHeaders,
  formatNotionError,
  type NotionUpdatePageInput,
  type NotionUpdatePageOutput,
} from './schemas.js';

export {
  NotionUpdatePageInputSchema,
  NotionUpdatePageOutputSchema,
  type NotionUpdatePageInput,
  type NotionUpdatePageOutput,
} from './schemas.js';

interface NotionPageResponse {
  id: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  properties: Record<string, unknown>;
}

interface NotionErrorResponse {
  code?: string;
  message?: string;
  status?: number;
}

export const notionUpdatePageNode = defineNode({
  type: 'notion_update_page',
  name: 'Notion Update Page',
  description: 'Update a Notion page — change property values, archive/unarchive, or update icon/cover.',
  category: 'integration',
  inputSchema: NotionUpdatePageInputSchema,
  outputSchema: NotionUpdatePageOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },

  executor: async (input: NotionUpdatePageInput, context) => {
    try {
      const apiToken = context.credentials?.notion?.apiToken as string | undefined;
      if (!apiToken) {
        return {
          success: false,
          error:
            'Notion API token not configured. Please provide context.credentials.notion.apiToken.',
        };
      }

      const body: Record<string, unknown> = {};
      if (input.properties !== undefined) body.properties = input.properties;
      if (input.archived !== undefined) body.archived = input.archived;
      if (input.icon !== undefined) body.icon = input.icon;
      if (input.cover !== undefined) body.cover = input.cover;

      const response = await fetchWithRetry(
        `${NOTION_API_BASE}/pages/${encodeURIComponent(input.pageId)}`,
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

      const data = (await response.json()) as NotionPageResponse;

      const output: NotionUpdatePageOutput = {
        id: data.id,
        url: data.url,
        createdTime: data.created_time,
        lastEditedTime: data.last_edited_time,
        archived: data.archived,
        properties: data.properties,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: formatNotionError(error, 'Failed to update Notion page'),
      };
    }
  },
});
