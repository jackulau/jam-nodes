import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  HubSpotUpdateObjectInputSchema,
  HubSpotUpdateObjectOutputSchema,
  type HubSpotUpdateObjectInput,
  type HubSpotUpdateObjectOutput,
} from './schemas.js';

export {
  HubSpotUpdateObjectInputSchema,
  HubSpotUpdateObjectOutputSchema,
  type HubSpotUpdateObjectInput,
  type HubSpotUpdateObjectOutput,
} from './schemas.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export const hubspotUpdateObjectNode = defineNode({
  type: 'hubspot_update_object',
  name: 'HubSpot Update Object',
  description: 'Update a contact, company, or deal in HubSpot CRM',
  category: 'integration',
  inputSchema: HubSpotUpdateObjectInputSchema,
  outputSchema: HubSpotUpdateObjectOutputSchema,
  estimatedDuration: 5,
  capabilities: { supportsRerun: true },
  executor: async (input: HubSpotUpdateObjectInput, context) => {
    try {
      const accessToken = context.credentials?.hubspot?.accessToken;
      if (!accessToken) {
        return {
          success: false,
          error: 'HubSpot access token not configured. Please provide context.credentials.hubspot.accessToken.',
        };
      }

      const response = await fetchWithRetry(
        `${HUBSPOT_API_BASE}/crm/v3/objects/${input.objectType}/${input.objectId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties: input.properties }),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HubSpot API error: ${response.status} - ${errorText}` };
      }

      const data = (await response.json()) as { id: string; properties: Record<string, string>; createdAt: string; updatedAt: string };
      const output: HubSpotUpdateObjectOutput = { id: data.id, properties: data.properties, createdAt: data.createdAt, updatedAt: data.updatedAt };
      return { success: true, output };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update HubSpot object' };
    }
  },
});
