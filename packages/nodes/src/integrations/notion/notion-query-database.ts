import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  NotionQueryDatabaseInputSchema,
  NotionQueryDatabaseOutputSchema,
  NOTION_API_BASE,
  buildNotionHeaders,
  formatNotionError,
  type NotionQueryDatabaseInput,
  type NotionQueryDatabaseOutput,
} from './schemas.js';

export {
  NotionQueryDatabaseInputSchema,
  NotionQueryDatabaseOutputSchema,
  type NotionQueryDatabaseInput,
  type NotionQueryDatabaseOutput,
} from './schemas.js';

interface NotionQueryResponse {
  results: Array<{
    id: string;
    url: string;
    created_time: string;
    last_edited_time: string;
    archived: boolean;
    properties: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionErrorResponse {
  code?: string;
  message?: string;
  status?: number;
}

export const notionQueryDatabaseNode = defineNode({
  type: 'notion_query_database',
  name: 'Notion Query Database',
  description: 'Query a Notion database with optional filter, sorts, cursor, and page size.',
  category: 'integration',
  inputSchema: NotionQueryDatabaseInputSchema,
  outputSchema: NotionQueryDatabaseOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },

  executor: async (input: NotionQueryDatabaseInput, context) => {
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
        page_size: input.pageSize,
      };
      if (input.filter !== undefined) body.filter = input.filter;
      if (input.sorts !== undefined) body.sorts = input.sorts;
      if (input.startCursor !== undefined) body.start_cursor = input.startCursor;

      const response = await fetchWithRetry(
        `${NOTION_API_BASE}/databases/${encodeURIComponent(input.databaseId)}/query`,
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

      const data = (await response.json()) as NotionQueryResponse;

      const output: NotionQueryDatabaseOutput = {
        results: data.results,
        hasMore: data.has_more,
        nextCursor: data.next_cursor,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: formatNotionError(error, 'Failed to query Notion database'),
      };
    }
  },
});
