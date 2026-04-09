import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  HubSpotDeleteObjectInputSchema,
  HubSpotDeleteObjectOutputSchema,
  type HubSpotDeleteObjectInput,
  type HubSpotDeleteObjectOutput,
} from './schemas.js';

export {
  HubSpotDeleteObjectInputSchema,
  HubSpotDeleteObjectOutputSchema,
  type HubSpotDeleteObjectInput,
  type HubSpotDeleteObjectOutput,
} from './schemas.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export const hubspotDeleteObjectNode = defineNode({
  type: 'hubspot_delete_object',
  name: 'HubSpot Delete Object',
  description: 'Delete a contact, company, or deal from HubSpot CRM',
  category: 'integration',
  inputSchema: HubSpotDeleteObjectInputSchema,
  outputSchema: HubSpotDeleteObjectOutputSchema,
  estimatedDuration: 5,
  capabilities: { supportsRerun: true },
  executor: async (input: HubSpotDeleteObjectInput, context) => {
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
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HubSpot API error: ${response.status} - ${errorText}` };
      }

      // HubSpot returns 204 No Content on successful delete — do NOT call response.json()
      const output: HubSpotDeleteObjectOutput = { id: input.objectId, deleted: true };
      return { success: true, output };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete HubSpot object' };
    }
  },
});
