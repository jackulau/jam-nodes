import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  YelpSearchBusinessesInputSchema,
  YelpSearchBusinessesOutputSchema,
  type YelpSearchBusinessesInput,
  type YelpSearchBusinessesOutput,
  type YelpBusiness,
} from './schemas.js';

export {
  YelpSearchBusinessesInputSchema,
  YelpSearchBusinessesOutputSchema,
  type YelpSearchBusinessesInput,
  type YelpSearchBusinessesOutput,
} from './schemas.js';

const YELP_API_BASE = 'https://api.yelp.com/v3';

interface SearchBusinessesResponse {
  businesses?: YelpBusiness[];
  total?: number;
  error?: { code?: string; description?: string };
}

export const yelpSearchBusinessesNode = defineNode({
  type: 'yelp_search_businesses',
  name: 'Yelp Search Businesses',
  description:
    'Search Yelp Fusion for businesses by term, location, and filters (radius, categories, price, sort).',
  category: 'integration',
  inputSchema: YelpSearchBusinessesInputSchema,
  outputSchema: YelpSearchBusinessesOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: YelpSearchBusinessesInput, context) => {
    try {
      const apiKey = context.credentials?.yelp?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error: 'Yelp API key not configured. Provide context.credentials.yelp.apiKey.',
        };
      }

      const params = new URLSearchParams();
      if (input.term) params.set('term', input.term);
      if (input.location) params.set('location', input.location);
      if (typeof input.latitude === 'number') params.set('latitude', String(input.latitude));
      if (typeof input.longitude === 'number') params.set('longitude', String(input.longitude));
      if (input.radius !== undefined) params.set('radius', String(input.radius));
      if (input.categories) params.set('categories', input.categories);
      if (input.locale) params.set('locale', input.locale);
      params.set('limit', String(input.limit));
      params.set('offset', String(input.offset));
      params.set('sort_by', input.sortBy);
      if (input.price) params.set('price', input.price);
      if (input.openNow !== undefined) params.set('open_now', String(input.openNow));
      if (input.openAt !== undefined) params.set('open_at', String(input.openAt));
      if (input.attributes) params.set('attributes', input.attributes);

      const response = await fetchWithRetry(
        `${YELP_API_BASE}/businesses/search?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      const data = (await response.json()) as SearchBusinessesResponse;

      if (data.error) {
        return {
          success: false,
          error: `Yelp API error: ${data.error.description ?? data.error.code ?? 'unknown_error'}`,
        };
      }

      const output: YelpSearchBusinessesOutput = {
        ok: true,
        total: data.total ?? 0,
        businesses: data.businesses ?? [],
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call Yelp businesses/search',
      };
    }
  },
});
