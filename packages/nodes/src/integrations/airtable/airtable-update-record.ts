import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  AirtableUpdateRecordInputSchema,
  AirtableUpdateRecordOutputSchema,
  type AirtableUpdateRecordInput,
  type AirtableUpdateRecordOutput,
} from './schemas.js';

export {
  AirtableUpdateRecordInputSchema,
  AirtableUpdateRecordOutputSchema,
  type AirtableUpdateRecordInput,
  type AirtableUpdateRecordOutput,
} from './schemas.js';

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

interface AirtableRecordResponse {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

export const airtableUpdateRecordNode = defineNode({
  type: 'airtable_update_record',
  name: 'Airtable Update Record',
  description: 'Update an existing record in an Airtable table (partial update via PATCH)',
  category: 'integration',
  inputSchema: AirtableUpdateRecordInputSchema,
  outputSchema: AirtableUpdateRecordOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: AirtableUpdateRecordInput, context) => {
    try {
      const accessToken = context.credentials?.airtable?.accessToken;
      if (!accessToken) {
        return {
          success: false,
          error: 'Airtable access token not configured. Please provide context.credentials.airtable.accessToken.',
        };
      }

      const response = await fetchWithRetry(
        `${AIRTABLE_API_BASE}/${input.baseId}/${encodeURIComponent(input.tableId)}/${input.recordId}`,
        {
          method: 'PATCH',
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

      const output: AirtableUpdateRecordOutput = {
        id: data.id,
        fields: data.fields,
        createdTime: data.createdTime,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update Airtable record',
      };
    }
  },
});
