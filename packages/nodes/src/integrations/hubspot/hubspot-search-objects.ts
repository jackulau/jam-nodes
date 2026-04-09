import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  HubSpotSearchObjectsInputSchema,
  HubSpotSearchObjectsOutputSchema,
  type HubSpotSearchObjectsInput,
  type HubSpotSearchObjectsOutput,
} from './schemas.js';

export {
  HubSpotSearchObjectsInputSchema,
  HubSpotSearchObjectsOutputSchema,
  type HubSpotSearchObjectsInput,
  type HubSpotSearchObjectsOutput,
} from './schemas.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export const hubspotSearchObjectsNode = defineNode({
  type: 'hubspot_search_objects',
  name: 'HubSpot Search Objects',
  description: 'Search contacts, companies, or deals in HubSpot CRM with filters and sorting',
  category: 'integration',
  inputSchema: HubSpotSearchObjectsInputSchema,
  outputSchema: HubSpotSearchObjectsOutputSchema,
  estimatedDuration: 5,
  capabilities: { supportsRerun: true },
  executor: async (input: HubSpotSearchObjectsInput, context) => {
    try {
      const accessToken = context.credentials?.hubspot?.accessToken;
      if (!accessToken) {
        return {
          success: false,
          error: 'HubSpot access token not configured. Please provide context.credentials.hubspot.accessToken.',
        };
      }

      const body: Record<string, unknown> = {};
      if (input.filterGroups !== undefined) body['filterGroups'] = input.filterGroups;
      if (input.sorts !== undefined) body['sorts'] = input.sorts;
      if (input.properties !== undefined) body['properties'] = input.properties;
      if (input.limit !== undefined) body['limit'] = input.limit;
      if (input.after !== undefined) body['after'] = input.after;

      const response = await fetchWithRetry(
        `${HUBSPOT_API_BASE}/crm/v3/objects/${input.objectType}/search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HubSpot API error: ${response.status} - ${errorText}` };
      }

      const data = (await response.json()) as {
        total: number;
        results: Array<{ id: string; properties: Record<string, string>; createdAt: string; updatedAt: string }>;
        paging?: { next?: { after: string } };
      };

      const output: HubSpotSearchObjectsOutput = {
        total: data.total,
        results: data.results.map((r) => ({
          id: r.id,
          properties: r.properties,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
        paging: data.paging,
      };

      return { success: true, output };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to search HubSpot objects' };
    }
  },
});
