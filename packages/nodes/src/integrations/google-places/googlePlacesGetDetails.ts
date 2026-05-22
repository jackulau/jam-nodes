import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  GooglePlacesGetDetailsInputSchema,
  GooglePlacesGetDetailsOutputSchema,
  type GooglePlacesGetDetailsInput,
  type GooglePlacesGetDetailsOutput,
  type GooglePlace,
} from './schemas.js';

export {
  GooglePlacesGetDetailsInputSchema,
  GooglePlacesGetDetailsOutputSchema,
  type GooglePlacesGetDetailsInput,
  type GooglePlacesGetDetailsOutput,
} from './schemas.js';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

interface DetailsErrorResponse {
  error?: { message?: string; status?: string };
}

export const googlePlacesGetDetailsNode = defineNode({
  type: 'google_places_get_details',
  name: 'Google Places Get Details',
  description:
    'Get full details for a single Google Place by place ID (e.g. "ChIJ..."). Returns business hours, contact info, ratings, and more.',
  category: 'integration',
  inputSchema: GooglePlacesGetDetailsInputSchema,
  outputSchema: GooglePlacesGetDetailsOutputSchema,
  estimatedDuration: 2,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: GooglePlacesGetDetailsInput, context) => {
    try {
      const apiKey = context.credentials?.googlePlaces?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'Google Places API key not configured. Provide context.credentials.googlePlaces.apiKey.',
        };
      }

      const normalizedId = input.placeId.startsWith('places/')
        ? input.placeId
        : `places/${input.placeId}`;

      const params = new URLSearchParams();
      if (input.languageCode) params.set('languageCode', input.languageCode);
      if (input.regionCode) params.set('regionCode', input.regionCode);
      const query = params.toString();

      const response = await fetchWithRetry(
        `${PLACES_API_BASE}/${normalizedId}${query ? `?${query}` : ''}`,
        {
          method: 'GET',
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': input.fieldMask,
          },
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      const data = (await response.json()) as GooglePlace & DetailsErrorResponse;

      if (data.error) {
        return {
          success: false,
          error: `Google Places API error: ${data.error.message ?? data.error.status ?? 'unknown_error'}`,
        };
      }

      const { error: _ignored, ...place } = data;
      const output: GooglePlacesGetDetailsOutput = {
        ok: true,
        place,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call Google Places getDetails',
      };
    }
  },
});
