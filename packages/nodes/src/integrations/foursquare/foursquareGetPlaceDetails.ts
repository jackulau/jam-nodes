import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  FoursquareGetPlaceDetailsInputSchema,
  FoursquareGetPlaceDetailsOutputSchema,
  type FoursquareGetPlaceDetailsInput,
  type FoursquareGetPlaceDetailsOutput,
  type FoursquarePlace,
} from './schemas.js';

export {
  FoursquareGetPlaceDetailsInputSchema,
  FoursquareGetPlaceDetailsOutputSchema,
  type FoursquareGetPlaceDetailsInput,
  type FoursquareGetPlaceDetailsOutput,
} from './schemas.js';

const FOURSQUARE_API_BASE = 'https://api.foursquare.com/v3';

interface DetailsResponse extends FoursquarePlace {
  message?: string;
}

export const foursquareGetPlaceDetailsNode = defineNode({
  type: 'foursquare_get_place_details',
  name: 'Foursquare Get Place Details',
  description:
    'Fetch full Foursquare Places v3 record by fsq_id. Configurable field selection via `fields`.',
  category: 'integration',
  inputSchema: FoursquareGetPlaceDetailsInputSchema,
  outputSchema: FoursquareGetPlaceDetailsOutputSchema,
  estimatedDuration: 2,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: FoursquareGetPlaceDetailsInput, context) => {
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
      const query = params.toString();

      const response = await fetchWithRetry(
        `${FOURSQUARE_API_BASE}/places/${encodeURIComponent(input.fsqId)}${query ? `?${query}` : ''}`,
        {
          method: 'GET',
          headers: {
            Authorization: apiKey,
            Accept: 'application/json',
          },
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      const data = (await response.json()) as DetailsResponse;

      if (!response.ok || data.message) {
        return {
          success: false,
          error: `Foursquare API error: ${data.message ?? `HTTP ${response.status}`}`,
        };
      }

      const { message: _ignored, ...place } = data;
      const output: FoursquareGetPlaceDetailsOutput = {
        ok: true,
        place,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call Foursquare places/{fsq_id}',
      };
    }
  },
});
