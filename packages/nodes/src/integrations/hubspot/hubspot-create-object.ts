import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  HubSpotCreateObjectInputSchema,
  HubSpotCreateObjectOutputSchema,
  type HubSpotCreateObjectInput,
  type HubSpotCreateObjectOutput,
} from './schemas.js';

export {
  HubSpotCreateObjectInputSchema,
  HubSpotCreateObjectOutputSchema,
  type HubSpotCreateObjectInput,
  type HubSpotCreateObjectOutput,
} from './schemas.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export const hubspotCreateObjectNode = defineNode({
  type: 'hubspot_create_object',
  name: 'HubSpot Create Object',
  description: 'Create a new contact, company, or deal in HubSpot CRM',
  category: 'integration',
  inputSchema: HubSpotCreateObjectInputSchema,
  outputSchema: HubSpotCreateObjectOutputSchema,
  estimatedDuration: 5,
  capabilities: { supportsRerun: true },
  executor: async (input: HubSpotCreateObjectInput, context) => {
    try {
      const accessToken = context.credentials?.hubspot?.accessToken;
      if (!accessToken) {
        return {
          success: false,
          error: 'HubSpot access token not configured. Please provide context.credentials.hubspot.accessToken.',
        };
      }

      const response = await fetchWithRetry(
        `${HUBSPOT_API_BASE}/crm/v3/objects/${input.objectType}`,
        {
          method: 'POST',
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
      const output: HubSpotCreateObjectOutput = { id: data.id, properties: data.properties, createdAt: data.createdAt, updatedAt: data.updatedAt };
      return { success: true, output };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create HubSpot object' };
    }
  },
});
