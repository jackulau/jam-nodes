import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  InstantlyAddLeadInputSchema,
  InstantlyAddLeadOutputSchema,
  type InstantlyAddLeadInput,
  type InstantlyAddLeadOutput,
} from './schemas.js';

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v1';

interface InstantlyAddLeadResponse {
  success?: boolean;
  leadId?: string;
  id?: string;
  error?: string;
}

export {
  InstantlyAddLeadInputSchema,
  InstantlyAddLeadOutputSchema,
  type InstantlyAddLeadInput,
  type InstantlyAddLeadOutput,
} from './schemas.js';

export const instantlyAddLeadNode = defineNode({
  type: 'instantly_add_lead',
  name: 'Instantly Add Lead',
  description: 'Add a lead to an Instantly.ai cold email campaign',
  category: 'integration',
  inputSchema: InstantlyAddLeadInputSchema,
  outputSchema: InstantlyAddLeadOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },

  executor: async (input: InstantlyAddLeadInput, context) => {
    try {
      const apiKey = context.credentials?.instantly?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'Instantly API key not configured. Please provide context.credentials.instantly.apiKey.',
        };
      }

      const body: Record<string, unknown> = {
        campaignId: input.campaignId,
        email: input.email,
      };
      if (input.firstName !== undefined) body.firstName = input.firstName;
      if (input.lastName !== undefined) body.lastName = input.lastName;
      if (input.companyName !== undefined) body.companyName = input.companyName;
      if (input.personalization !== undefined) body.personalization = input.personalization;
      if (input.customVariables !== undefined) body.customVariables = input.customVariables;

      const response = await fetchWithRetry(
        `${INSTANTLY_API_BASE}/leads`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (!response.ok) {
        const errorText = (await response.text()).slice(0, 500);
        return {
          success: false,
          error: `Instantly API error ${response.status}: ${errorText}`,
        };
      }

      const data = (await response.json()) as InstantlyAddLeadResponse;

      if (data.success === false) {
        return {
          success: false,
          error: `Instantly API error: ${data.error ?? 'unknown_error'}`,
        };
      }

      const leadId = data.leadId ?? data.id ?? '';

      const output: InstantlyAddLeadOutput = {
        success: true,
        leadId,
        campaignId: input.campaignId,
        email: input.email,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add Instantly lead',
      };
    }
  },
});
