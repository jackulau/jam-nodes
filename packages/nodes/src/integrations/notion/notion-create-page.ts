import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  NotionCreatePageInputSchema,
  NotionCreatePageOutputSchema,
  NOTION_API_BASE,
  buildNotionHeaders,
  formatNotionError,
  type NotionCreatePageInput,
  type NotionCreatePageOutput,
} from './schemas.js';

export {
  NotionCreatePageInputSchema,
  NotionCreatePageOutputSchema,
  type NotionCreatePageInput,
  type NotionCreatePageOutput,
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

export const notionCreatePageNode = defineNode({
  type: 'notion_create_page',
  name: 'Notion Create Page',
  description: 'Create a new page inside a Notion database, with optional content blocks, icon, and cover.',
  category: 'integration',
  inputSchema: NotionCreatePageInputSchema,
  outputSchema: NotionCreatePageOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },

  executor: async (input: NotionCreatePageInput, context) => {
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
        parent: { database_id: input.parentDatabaseId },
        properties: input.properties,
      };
      if (input.children !== undefined) body.children = input.children;
      if (input.icon !== undefined) body.icon = input.icon;
      if (input.cover !== undefined) body.cover = input.cover;

      const response = await fetchWithRetry(
        `${NOTION_API_BASE}/pages`,
        {
          method: 'POST',
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

      const output: NotionCreatePageOutput = {
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
        error: formatNotionError(error, 'Failed to create Notion page'),
      };
    }
  },
});
