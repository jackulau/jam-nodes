import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  InstantlyGetAnalyticsInputSchema,
  InstantlyGetAnalyticsOutputSchema,
  type InstantlyGetAnalyticsInput,
  type InstantlyGetAnalyticsOutput,
} from './schemas.js';

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v1';

interface InstantlyAnalyticsResponse {
  sent?: number;
  opened?: number;
  clicked?: number;
  replied?: number;
  bounced?: number;
  error?: string;
}

export {
  InstantlyGetAnalyticsInputSchema,
  InstantlyGetAnalyticsOutputSchema,
  type InstantlyGetAnalyticsInput,
  type InstantlyGetAnalyticsOutput,
} from './schemas.js';

export const instantlyGetAnalyticsNode = defineNode({
  type: 'instantly_get_analytics',
  name: 'Instantly Get Analytics',
  description: 'Fetch performance metrics for an Instantly.ai campaign',
  category: 'integration',
  inputSchema: InstantlyGetAnalyticsInputSchema,
  outputSchema: InstantlyGetAnalyticsOutputSchema,
  estimatedDuration: 2,
  capabilities: {
    supportsRerun: true,
  },

  executor: async (input: InstantlyGetAnalyticsInput, context) => {
    try {
      const apiKey = context.credentials?.instantly?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'Instantly API key not configured. Please provide context.credentials.instantly.apiKey.',
        };
      }

      const url = `${INSTANTLY_API_BASE}/analytics/campaigns/${encodeURIComponent(input.campaignId)}`;

      const response = await fetchWithRetry(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
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

      const data = (await response.json()) as InstantlyAnalyticsResponse;

      const output: InstantlyGetAnalyticsOutput = {
        campaignId: input.campaignId,
        sent: data.sent ?? 0,
        opened: data.opened ?? 0,
        clicked: data.clicked ?? 0,
        replied: data.replied ?? 0,
        bounced: data.bounced ?? 0,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch Instantly analytics',
      };
    }
  },
});
