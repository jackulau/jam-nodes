import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  GooglePlacesSearchTextInputSchema,
  GooglePlacesSearchTextOutputSchema,
  type GooglePlacesSearchTextInput,
  type GooglePlacesSearchTextOutput,
  type GooglePlace,
} from './schemas.js';

export {
  GooglePlacesSearchTextInputSchema,
  GooglePlacesSearchTextOutputSchema,
  type GooglePlacesSearchTextInput,
  type GooglePlacesSearchTextOutput,
} from './schemas.js';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

interface SearchTextResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
  error?: { message?: string; status?: string };
}

export const googlePlacesSearchTextNode = defineNode({
  type: 'google_places_search_text',
  name: 'Google Places Search Text',
  description:
    'Search Google Places (New) by free-text query — e.g. "pizza near Times Square". Returns matching place summaries.',
  category: 'integration',
  inputSchema: GooglePlacesSearchTextInputSchema,
  outputSchema: GooglePlacesSearchTextOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: GooglePlacesSearchTextInput, context) => {
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
        textQuery: input.textQuery,
        maxResultCount: input.maxResultCount,
      };
      if (input.languageCode) body.languageCode = input.languageCode;
      if (input.regionCode) body.regionCode = input.regionCode;
      if (input.includedType) body.includedType = input.includedType;
      if (input.openNow !== undefined) body.openNow = input.openNow;
      if (input.minRating !== undefined) body.minRating = input.minRating;
      if (input.pageToken) body.pageToken = input.pageToken;

      const response = await fetchWithRetry(
        `${PLACES_API_BASE}/places:searchText`,
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

      const data = (await response.json()) as SearchTextResponse;

      if (data.error) {
        return {
          success: false,
          error: `Google Places API error: ${data.error.message ?? data.error.status ?? 'unknown_error'}`,
        };
      }

      const output: GooglePlacesSearchTextOutput = {
        ok: true,
        places: data.places ?? [],
        nextPageToken: data.nextPageToken ?? null,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call Google Places searchText',
      };
    }
  },
});
