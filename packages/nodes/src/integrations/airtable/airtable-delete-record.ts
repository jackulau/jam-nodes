import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  AirtableDeleteRecordInputSchema,
  AirtableDeleteRecordOutputSchema,
  type AirtableDeleteRecordInput,
  type AirtableDeleteRecordOutput,
} from './schemas.js';

export {
  AirtableDeleteRecordInputSchema,
  AirtableDeleteRecordOutputSchema,
  type AirtableDeleteRecordInput,
  type AirtableDeleteRecordOutput,
} from './schemas.js';

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

interface AirtableDeleteResponse {
  id: string;
  deleted: boolean;
}

export const airtableDeleteRecordNode = defineNode({
  type: 'airtable_delete_record',
  name: 'Airtable Delete Record',
  description: 'Delete a record from an Airtable table',
  category: 'integration',
  inputSchema: AirtableDeleteRecordInputSchema,
  outputSchema: AirtableDeleteRecordOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: AirtableDeleteRecordInput, context) => {
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
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
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

      const data = (await response.json()) as AirtableDeleteResponse;

      const output: AirtableDeleteRecordOutput = {
        id: data.id,
        deleted: data.deleted,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete Airtable record',
      };
    }
  },
});
