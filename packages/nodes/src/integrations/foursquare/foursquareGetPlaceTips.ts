import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  FoursquareGetPlaceTipsInputSchema,
  FoursquareGetPlaceTipsOutputSchema,
  type FoursquareGetPlaceTipsInput,
  type FoursquareGetPlaceTipsOutput,
  type FoursquareTip,
} from './schemas.js';

export {
  FoursquareGetPlaceTipsInputSchema,
  FoursquareGetPlaceTipsOutputSchema,
  type FoursquareGetPlaceTipsInput,
  type FoursquareGetPlaceTipsOutput,
} from './schemas.js';

const FOURSQUARE_API_BASE = 'https://api.foursquare.com/v3';

interface TipsResponse {
  // v3 returns either { tips: [...] } envelope (some endpoints) or a bare array.
  tips?: FoursquareTip[];
  message?: string;
}

export const foursquareGetPlaceTipsNode = defineNode({
  type: 'foursquare_get_place_tips',
  name: 'Foursquare Get Place Tips',
  description:
    'Fetch user-submitted tips for a Foursquare place by fsq_id. Sort by POPULAR or NEWEST.',
  category: 'integration',
  inputSchema: FoursquareGetPlaceTipsInputSchema,
  outputSchema: FoursquareGetPlaceTipsOutputSchema,
  estimatedDuration: 2,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: FoursquareGetPlaceTipsInput, context) => {
    try {
      const apiKey = context.credentials?.foursquare?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error: 'Foursquare API key not configured. Provide context.credentials.foursquare.apiKey.',
        };
      }

      const params = new URLSearchParams();
      if (input.fields) params.set('fields', input.fields);
      params.set('sort', input.sort);
      params.set('limit', String(input.limit));

      const response = await fetchWithRetry(
        `${FOURSQUARE_API_BASE}/places/${encodeURIComponent(input.fsqId)}/tips?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: apiKey,
            Accept: 'application/json',
          },
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      const raw = (await response.json()) as TipsResponse | FoursquareTip[];
      const enveloped = Array.isArray(raw) ? { tips: raw } : raw;

      if (!response.ok || enveloped.message) {
        return {
          success: false,
          error: `Foursquare API error: ${enveloped.message ?? `HTTP ${response.status}`}`,
        };
      }

      const output: FoursquareGetPlaceTipsOutput = {
        ok: true,
        tips: enveloped.tips ?? [],
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call Foursquare places/{fsq_id}/tips',
      };
    }
  },
});
