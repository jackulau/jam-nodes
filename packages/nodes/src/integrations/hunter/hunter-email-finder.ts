import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  HunterEmailFinderInputSchema,
  HunterEmailFinderOutputSchema,
  type HunterEmailFinderInput,
  type HunterEmailFinderOutput,
} from './schemas.js';

export {
  HunterEmailFinderInputSchema,
  HunterEmailFinderOutputSchema,
  type HunterEmailFinderInput,
  type HunterEmailFinderOutput,
} from './schemas.js';

const HUNTER_API_BASE = 'https://api.hunter.io/v2';

interface HunterEmailFinderResponse {
  data: {
    email: string | null;
    score: number;
    position: string | null;
    company: string | null;
  };
}

export const hunterEmailFinderNode = defineNode({
  type: 'hunter_email_finder',
  name: 'Hunter Email Finder',
  description: 'Find the email address of a person at a domain using Hunter.io',
  category: 'integration',
  inputSchema: HunterEmailFinderInputSchema,
  outputSchema: HunterEmailFinderOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: HunterEmailFinderInput, context) => {
    try {
      const apiKey = context.credentials?.hunter?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error: 'Hunter API key not configured. Please provide context.credentials.hunter.apiKey.',
        };
      }

      const params = new URLSearchParams({
        api_key: apiKey,
        domain: input.domain,
        first_name: input.firstName,
        last_name: input.lastName,
      });

      const response = await fetchWithRetry(
        `${HUNTER_API_BASE}/email-finder?${params}`,
        { method: 'GET' },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Hunter API error: ${response.status} - ${errorText}`,
        };
      }

      const json = (await response.json()) as HunterEmailFinderResponse;
      const data = json.data;

      const output: HunterEmailFinderOutput = {
        email: data.email ?? null,
        score: data.score,
        position: data.position ?? null,
        company: data.company ?? null,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find email',
      };
    }
  },
});
