import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  GooglePlacesSearchNearbyInputSchema,
  GooglePlacesSearchNearbyOutputSchema,
  type GooglePlacesSearchNearbyInput,
  type GooglePlacesSearchNearbyOutput,
  type GooglePlace,
} from './schemas.js';

export {
  GooglePlacesSearchNearbyInputSchema,
  GooglePlacesSearchNearbyOutputSchema,
  type GooglePlacesSearchNearbyInput,
  type GooglePlacesSearchNearbyOutput,
} from './schemas.js';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

interface SearchNearbyResponse {
  places?: GooglePlace[];
  error?: { message?: string; status?: string };
}

export const googlePlacesSearchNearbyNode = defineNode({
  type: 'google_places_search_nearby',
  name: 'Google Places Search Nearby',
  description:
    'Search Google Places (New) by location + radius. Returns places of the requested types within the circle.',
  category: 'integration',
  inputSchema: GooglePlacesSearchNearbyInputSchema,
  outputSchema: GooglePlacesSearchNearbyOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: GooglePlacesSearchNearbyInput, context) => {
    try {
      const apiKey = context.credentials?.googlePlaces?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'Google Places API key not configured. Provide context.credentials.googlePlaces.apiKey.',
        };
      }

      const body: Record<string, unknown> = {
        maxResultCount: input.maxResultCount,
        locationRestriction: {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: input.radiusMeters,
          },
        },
      };
      if (input.includedTypes?.length) body.includedTypes = input.includedTypes;
      if (input.excludedTypes?.length) body.excludedTypes = input.excludedTypes;
      if (input.languageCode) body.languageCode = input.languageCode;
      if (input.regionCode) body.regionCode = input.regionCode;
      if (input.rankPreference) body.rankPreference = input.rankPreference;

      const response = await fetchWithRetry(
        `${PLACES_API_BASE}/places:searchNearby`,
        {
          method: 'POST',
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': input.fieldMask,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      const data = (await response.json()) as SearchNearbyResponse;

      if (data.error) {
        return {
          success: false,
          error: `Google Places API error: ${data.error.message ?? data.error.status ?? 'unknown_error'}`,
        };
      }

      const output: GooglePlacesSearchNearbyOutput = {
        ok: true,
        places: data.places ?? [],
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call Google Places searchNearby',
      };
    }
  },
});
