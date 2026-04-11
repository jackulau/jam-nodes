import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  InstantlyCreateCampaignInputSchema,
  InstantlyCreateCampaignOutputSchema,
  type InstantlyCreateCampaignInput,
  type InstantlyCreateCampaignOutput,
} from './schemas.js';

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v1';

interface InstantlyCreateCampaignResponse {
  success?: boolean;
  campaignId?: string;
  id?: string;
  error?: string;
}

export {
  InstantlyCreateCampaignInputSchema,
  InstantlyCreateCampaignOutputSchema,
  type InstantlyCreateCampaignInput,
  type InstantlyCreateCampaignOutput,
} from './schemas.js';

export const instantlyCreateCampaignNode = defineNode({
  type: 'instantly_create_campaign',
  name: 'Instantly Create Campaign',
  description: 'Create an Instantly.ai cold email campaign with a drip sequence',
  category: 'integration',
  inputSchema: InstantlyCreateCampaignInputSchema,
  outputSchema: InstantlyCreateCampaignOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: false,
  },

  executor: async (input: InstantlyCreateCampaignInput, context) => {
    try {
      const apiKey = context.credentials?.instantly?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'Instantly API key not configured. Please provide context.credentials.instantly.apiKey.',
        };
      }

      const body = {
        name: input.name,
        emailAccounts: input.emailAccounts,
        sequence: input.sequence,
      };

      const response = await fetchWithRetry(
        `${INSTANTLY_API_BASE}/campaigns`,
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

      const data = (await response.json()) as InstantlyCreateCampaignResponse;

      if (data.success === false) {
        return {
          success: false,
          error: `Instantly API error: ${data.error ?? 'unknown_error'}`,
        };
      }

      const campaignId = data.campaignId ?? data.id ?? '';

      const output: InstantlyCreateCampaignOutput = {
        success: true,
        campaignId,
        name: input.name,
        emailAccountCount: input.emailAccounts.length,
        sequenceStepCount: input.sequence.length,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create Instantly campaign',
      };
    }
  },
});
