import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  YelpGetBusinessDetailsInputSchema,
  YelpGetBusinessDetailsOutputSchema,
  type YelpGetBusinessDetailsInput,
  type YelpGetBusinessDetailsOutput,
  type YelpBusiness,
} from './schemas.js';

export {
  YelpGetBusinessDetailsInputSchema,
  YelpGetBusinessDetailsOutputSchema,
  type YelpGetBusinessDetailsInput,
  type YelpGetBusinessDetailsOutput,
} from './schemas.js';

const YELP_API_BASE = 'https://api.yelp.com/v3';

interface DetailsErrorResponse {
  error?: { code?: string; description?: string };
}

export const yelpGetBusinessDetailsNode = defineNode({
  type: 'yelp_get_business_details',
  name: 'Yelp Get Business Details',
  description:
    'Fetch full Yelp Fusion business details by id (or alias). Returns photos, hours, categories, ratings.',
  category: 'integration',
  inputSchema: YelpGetBusinessDetailsInputSchema,
  outputSchema: YelpGetBusinessDetailsOutputSchema,
  estimatedDuration: 2,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: YelpGetBusinessDetailsInput, context) => {
    try {
      const apiKey = context.credentials?.yelp?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error: 'Yelp API key not configured. Provide context.credentials.yelp.apiKey.',
        };
      }

      const params = new URLSearchParams();
      if (input.locale) params.set('locale', input.locale);
      const query = params.toString();

      const response = await fetchWithRetry(
        `${YELP_API_BASE}/businesses/${encodeURIComponent(input.businessId)}${query ? `?${query}` : ''}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      const data = (await response.json()) as YelpBusiness & DetailsErrorResponse;

      if (data.error) {
        return {
          success: false,
          error: `Yelp API error: ${data.error.description ?? data.error.code ?? 'unknown_error'}`,
        };
      }

      const { error: _ignored, ...business } = data;
      const output: YelpGetBusinessDetailsOutput = {
        ok: true,
        business,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call Yelp businesses/{id}',
      };
    }
  },
});
