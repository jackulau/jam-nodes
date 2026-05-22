import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  YelpGetBusinessReviewsInputSchema,
  YelpGetBusinessReviewsOutputSchema,
  type YelpGetBusinessReviewsInput,
  type YelpGetBusinessReviewsOutput,
  type YelpReview,
} from './schemas.js';

export {
  YelpGetBusinessReviewsInputSchema,
  YelpGetBusinessReviewsOutputSchema,
  type YelpGetBusinessReviewsInput,
  type YelpGetBusinessReviewsOutput,
} from './schemas.js';

const YELP_API_BASE = 'https://api.yelp.com/v3';

interface ReviewsResponse {
  reviews?: YelpReview[];
  total?: number;
  error?: { code?: string; description?: string };
}

export const yelpGetBusinessReviewsNode = defineNode({
  type: 'yelp_get_business_reviews',
  name: 'Yelp Get Business Reviews',
  description:
    'Fetch up to three Yelp reviews for a business id. Yelp Fusion limits this endpoint to three most-recent reviews.',
  category: 'integration',
  inputSchema: YelpGetBusinessReviewsInputSchema,
  outputSchema: YelpGetBusinessReviewsOutputSchema,
  estimatedDuration: 2,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: YelpGetBusinessReviewsInput, context) => {
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
        `${YELP_API_BASE}/businesses/${encodeURIComponent(input.businessId)}/reviews${query ? `?${query}` : ''}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      const data = (await response.json()) as ReviewsResponse;

      if (data.error) {
        return {
          success: false,
          error: `Yelp API error: ${data.error.description ?? data.error.code ?? 'unknown_error'}`,
        };
      }

      const output: YelpGetBusinessReviewsOutput = {
        ok: true,
        total: data.total ?? 0,
        reviews: data.reviews ?? [],
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call Yelp businesses/{id}/reviews',
      };
    }
  },
});
