import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  HubSpotGetObjectInputSchema,
  HubSpotGetObjectOutputSchema,
  type HubSpotGetObjectInput,
  type HubSpotGetObjectOutput,
} from './schemas.js';

export {
  HubSpotGetObjectInputSchema,
  HubSpotGetObjectOutputSchema,
  type HubSpotGetObjectInput,
  type HubSpotGetObjectOutput,
} from './schemas.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export const hubspotGetObjectNode = defineNode({
  type: 'hubspot_get_object',
  name: 'HubSpot Get Object',
  description: 'Get a contact, company, or deal from HubSpot CRM by ID',
  category: 'integration',
  inputSchema: HubSpotGetObjectInputSchema,
  outputSchema: HubSpotGetObjectOutputSchema,
  estimatedDuration: 5,
  capabilities: { supportsRerun: true },
  executor: async (input: HubSpotGetObjectInput, context) => {
    try {
      const accessToken = context.credentials?.hubspot?.accessToken;
      if (!accessToken) {
        return {
          success: false,
          error: 'HubSpot access token not configured. Please provide context.credentials.hubspot.accessToken.',
        };
      }

      let url = `${HUBSPOT_API_BASE}/crm/v3/objects/${input.objectType}/${input.objectId}`;
      if (input.properties && input.properties.length > 0) {
        url += `?properties=${input.properties.join(',')}`;
      }

      const response = await fetchWithRetry(
        url,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HubSpot API error: ${response.status} - ${errorText}` };
      }

      const data = (await response.json()) as { id: string; properties: Record<string, string>; createdAt: string; updatedAt: string };
      const output: HubSpotGetObjectOutput = { id: data.id, properties: data.properties, createdAt: data.createdAt, updatedAt: data.updatedAt };
      return { success: true, output };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get HubSpot object' };
    }
  },
});
