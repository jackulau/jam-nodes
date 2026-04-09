import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  HubSpotListMembershipInputSchema,
  HubSpotListMembershipOutputSchema,
  type HubSpotListMembershipInput,
  type HubSpotListMembershipOutput,
} from './schemas.js';

export {
  HubSpotListMembershipInputSchema,
  HubSpotListMembershipOutputSchema,
  type HubSpotListMembershipInput,
  type HubSpotListMembershipOutput,
} from './schemas.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export const hubspotListMembershipNode = defineNode({
  type: 'hubspot_list_membership',
  name: 'HubSpot List Membership',
  description: 'Add or remove contacts from a HubSpot list',
  category: 'integration',
  inputSchema: HubSpotListMembershipInputSchema,
  outputSchema: HubSpotListMembershipOutputSchema,
  estimatedDuration: 5,
  capabilities: { supportsRerun: true },
  executor: async (input: HubSpotListMembershipInput, context) => {
    try {
      const accessToken = context.credentials?.hubspot?.accessToken;
      if (!accessToken) {
        return {
          success: false,
          error: 'HubSpot access token not configured. Please provide context.credentials.hubspot.accessToken.',
        };
      }

      const bodyKey = input.action === 'add' ? 'recordIdsToAdd' : 'recordIdsToRemove';

      const response = await fetchWithRetry(
        `${HUBSPOT_API_BASE}/crm/v3/lists/${input.listId}/memberships/${input.action}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ [bodyKey]: input.contactIds }),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HubSpot API error: ${response.status} - ${errorText}` };
      }

      const data = (await response.json()) as Record<string, string[]>;
      const processedKey = input.action === 'add' ? 'recordIdsAdded' : 'recordIdsRemoved';

      const output: HubSpotListMembershipOutput = {
        recordIdsProcessed: data[processedKey] ?? [],
        recordIdsMissing: data['recordIdsMissing'] ?? [],
      };

      return { success: true, output };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update HubSpot list membership' };
    }
  },
});
