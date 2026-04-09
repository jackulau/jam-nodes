import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  AirtableCreateRecordInputSchema,
  AirtableCreateRecordOutputSchema,
  type AirtableCreateRecordInput,
  type AirtableCreateRecordOutput,
} from './schemas.js';

export {
  AirtableCreateRecordInputSchema,
  AirtableCreateRecordOutputSchema,
  type AirtableCreateRecordInput,
  type AirtableCreateRecordOutput,
} from './schemas.js';

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

interface AirtableRecordResponse {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

export const airtableCreateRecordNode = defineNode({
  type: 'airtable_create_record',
  name: 'Airtable Create Record',
  description: 'Create a new record in an Airtable table',
  category: 'integration',
  inputSchema: AirtableCreateRecordInputSchema,
  outputSchema: AirtableCreateRecordOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: AirtableCreateRecordInput, context) => {
    try {
      const accessToken = context.credentials?.airtable?.accessToken;
      if (!accessToken) {
        return {
          success: false,
          error: 'Airtable access token not configured. Please provide context.credentials.airtable.accessToken.',
        };
      }

      const response = await fetchWithRetry(
        `${AIRTABLE_API_BASE}/${input.baseId}/${encodeURIComponent(input.tableId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fields: input.fields }),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Airtable API error: ${response.status} - ${errorText}`,
        };
      }

      const data = (await response.json()) as AirtableRecordResponse;

      const output: AirtableCreateRecordOutput = {
        id: data.id,
        fields: data.fields,
        createdTime: data.createdTime,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create Airtable record',
      };
    }
  },
});
