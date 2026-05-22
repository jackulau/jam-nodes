import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  FoursquareSearchPlacesInputSchema,
  FoursquareSearchPlacesOutputSchema,
  type FoursquareSearchPlacesInput,
  type FoursquareSearchPlacesOutput,
  type FoursquarePlace,
} from './schemas.js';

export {
  FoursquareSearchPlacesInputSchema,
  FoursquareSearchPlacesOutputSchema,
  type FoursquareSearchPlacesInput,
  type FoursquareSearchPlacesOutput,
} from './schemas.js';

const FOURSQUARE_API_BASE = 'https://api.foursquare.com/v3';

interface SearchPlacesResponse {
  results?: FoursquarePlace[];
  context?: { next_cursor?: string };
  message?: string;
}

export const foursquareSearchPlacesNode = defineNode({
  type: 'foursquare_search_places',
  name: 'Foursquare Search Places',
  description:
    'Search Foursquare Places v3 by query + location (ll, near, or bounding box) with category, chain, price, and sort filters.',
  category: 'integration',
  inputSchema: FoursquareSearchPlacesInputSchema,
  outputSchema: FoursquareSearchPlacesOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: FoursquareSearchPlacesInput, context) => {
    try {
      const apiKey = context.credentials?.foursquare?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error: 'Foursquare API key not configured. Provide context.credentials.foursquare.apiKey.',
        };
      }

      const params = new URLSearchParams();
      if (input.query) params.set('query', input.query);
      if (input.ll) params.set('ll', input.ll);
      if (input.near) params.set('near', input.near);
      if (input.radius !== undefined) params.set('radius', String(input.radius));
      if (input.categories) params.set('categories', input.categories);
      if (input.chains) params.set('chains', input.chains);
      if (input.excludeChains) params.set('exclude_chains', input.excludeChains);
      if (input.excludeAllChains !== undefined) params.set('exclude_all_chains', String(input.excludeAllChains));
      if (input.fields) params.set('fields', input.fields);
      if (input.minPrice !== undefined) params.set('min_price', String(input.minPrice));
      if (input.maxPrice !== undefined) params.set('max_price', String(input.maxPrice));
      if (input.openNow !== undefined) params.set('open_now', String(input.openNow));
      if (input.openAt) params.set('open_at', input.openAt);
      if (input.nePoint) params.set('ne', input.nePoint);
      if (input.swPoint) params.set('sw', input.swPoint);
      params.set('sort', input.sort);
      params.set('limit', String(input.limit));
      if (input.cursor) params.set('cursor', input.cursor);

      const response = await fetchWithRetry(
        `${FOURSQUARE_API_BASE}/places/search?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: apiKey,
            Accept: 'application/json',
          },
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      const data = (await response.json()) as SearchPlacesResponse;

      if (!response.ok || data.message) {
        return {
          success: false,
          error: `Foursquare API error: ${data.message ?? `HTTP ${response.status}`}`,
        };
      }

      const output: FoursquareSearchPlacesOutput = {
        ok: true,
        results: data.results ?? [],
        nextCursor: data.context?.next_cursor ?? null,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call Foursquare places/search',
      };
    }
  },
});
