import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  SendgridGetContactsInputSchema,
  SendgridGetContactsOutputSchema,
  type SendgridGetContactsInput,
  type SendgridGetContactsOutput,
  type SendgridContact,
} from './schemas.js';

export {
  SendgridGetContactsInputSchema,
  SendgridGetContactsOutputSchema,
  type SendgridGetContactsInput,
  type SendgridGetContactsOutput,
} from './schemas.js';

const SENDGRID_API_BASE = 'https://api.sendgrid.com/v3';

type SendgridSearchResult = {
  id?: string;
  email?: string;
  first_name?: string | null;
  last_name?: string | null;
  list_ids?: string[];
};

type SendgridSearchResponse = {
  result?: SendgridSearchResult[];
  contact_count?: number;
};

function escapeSgql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildQuery(listId: string | undefined): string {
  if (!listId) return '';
  return `CONTAINS(list_ids, '${escapeSgql(listId)}')`;
}

export const sendgridGetContactsNode = defineNode({
  type: 'sendgrid_get_contacts',
  name: 'SendGrid Get Contacts',
  description:
    'Search SendGrid Marketing Contacts (capped at 50 per call by the SendGrid API)',
  category: 'integration',
  inputSchema: SendgridGetContactsInputSchema,
  outputSchema: SendgridGetContactsOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: SendgridGetContactsInput, context) => {
    try {
      const apiKey = context.credentials?.sendgrid?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'SendGrid API key not configured. Please provide context.credentials.sendgrid.apiKey.',
        };
      }

      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;
      const query = buildQuery(input.listId);

      const response = await fetchWithRetry(
        `${SENDGRID_API_BASE}/marketing/contacts/search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (response.status < 200 || response.status >= 300) {
        const errorBody = await response.text().catch(() => '');
        return {
          success: false,
          error: `SendGrid get contacts failed: ${response.status} ${errorBody}`.trim(),
        };
      }

      const data = (await response.json().catch(() => ({}))) as SendgridSearchResponse;
      const rawResults = data.result ?? [];

      const mapped: SendgridContact[] = rawResults.map((item) => ({
        id: item.id ?? '',
        email: item.email ?? '',
        firstName: item.first_name ?? null,
        lastName: item.last_name ?? null,
        listIds: item.list_ids ?? [],
      }));

      const paged = mapped.slice(offset, offset + limit);

      const output: SendgridGetContactsOutput = {
        contacts: paged,
        total: data.contact_count ?? mapped.length,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch SendGrid contacts',
      };
    }
  },
});
