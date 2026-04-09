import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  AirtableGetRecordsInputSchema,
  AirtableGetRecordsOutputSchema,
  type AirtableGetRecordsInput,
  type AirtableGetRecordsOutput,
} from './schemas.js';

export {
  AirtableGetRecordsInputSchema,
  AirtableGetRecordsOutputSchema,
  type AirtableGetRecordsInput,
  type AirtableGetRecordsOutput,
} from './schemas.js';

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

interface AirtableListResponse {
  records: Array<{
    id: string;
    fields: Record<string, unknown>;
    createdTime: string;
  }>;
  offset?: string;
}

export const airtableGetRecordsNode = defineNode({
  type: 'airtable_get_records',
  name: 'Airtable Get Records',
  description: 'List records from an Airtable table with optional filtering, sorting, and pagination',
  category: 'integration',
  inputSchema: AirtableGetRecordsInputSchema,
  outputSchema: AirtableGetRecordsOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: AirtableGetRecordsInput, context) => {
    try {
      const accessToken = context.credentials?.airtable?.accessToken;
      if (!accessToken) {
        return {
          success: false,
          error: 'Airtable access token not configured. Please provide context.credentials.airtable.accessToken.',
        };
      }

      const params = new URLSearchParams();

      if (input.filterByFormula) {
        params.set('filterByFormula', input.filterByFormula);
      }

      if (input.maxRecords !== undefined) {
        params.set('maxRecords', String(input.maxRecords));
      }

      if (input.sort) {
        for (let i = 0; i < input.sort.length; i++) {
          const s = input.sort[i]!;
          params.set(`sort[${i}][field]`, s.field);
          if (s.direction) {
            params.set(`sort[${i}][direction]`, s.direction);
          }
        }
      }

      const queryString = params.toString();
      const url = `${AIRTABLE_API_BASE}/${input.baseId}/${encodeURIComponent(input.tableId)}${queryString ? `?${queryString}` : ''}`;

      const response = await fetchWithRetry(
        url,
        {
          method: 'GET',
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

      const data = (await response.json()) as AirtableListResponse;

      const output: AirtableGetRecordsOutput = {
        records: data.records.map((r) => ({
          id: r.id,
          fields: r.fields,
          createdTime: r.createdTime,
        })),
        offset: data.offset,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get Airtable records',
      };
    }
  },
});
