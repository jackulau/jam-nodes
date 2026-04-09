import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  HunterDomainSearchInputSchema,
  HunterDomainSearchOutputSchema,
  type HunterDomainSearchInput,
  type HunterDomainSearchOutput,
} from './schemas.js';

export {
  HunterDomainSearchInputSchema,
  HunterDomainSearchOutputSchema,
  type HunterDomainSearchInput,
  type HunterDomainSearchOutput,
} from './schemas.js';

const HUNTER_API_BASE = 'https://api.hunter.io/v2';

interface HunterSource {
  domain: string;
  uri: string;
  extracted_on: string;
  last_seen_on: string;
  still_on_page: boolean;
}

interface HunterEmail {
  value: string;
  type: string | null;
  confidence: number;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  department: string | null;
  sources: HunterSource[];
}

interface HunterDomainSearchResponse {
  data: {
    emails: HunterEmail[];
    meta: {
      results: number;
      limit: number;
      offset: number;
    };
  };
}

export const hunterDomainSearchNode = defineNode({
  type: 'hunter_domain_search',
  name: 'Hunter Domain Search',
  description: 'Search for email addresses associated with a domain using Hunter.io',
  category: 'integration',
  inputSchema: HunterDomainSearchInputSchema,
  outputSchema: HunterDomainSearchOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: HunterDomainSearchInput, context) => {
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
      });

      if (input.limit !== undefined) {
        params.set('limit', String(input.limit));
      }
      if (input.type) {
        params.set('type', input.type);
      }
      if (input.seniority && input.seniority.length > 0) {
        params.set('seniority', input.seniority.join(','));
      }
      if (input.department && input.department.length > 0) {
        params.set('department', input.department.join(','));
      }

      const response = await fetchWithRetry(
        `${HUNTER_API_BASE}/domain-search?${params}`,
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

      const json = (await response.json()) as HunterDomainSearchResponse;
      const data = json.data;

      const output: HunterDomainSearchOutput = {
        emails: data.emails.map((email) => ({
          value: email.value,
          type: email.type as 'personal' | 'generic' | null,
          confidence: email.confidence,
          firstName: email.first_name,
          lastName: email.last_name,
          position: email.position,
          department: email.department,
          sources: email.sources.map((source) => ({
            domain: source.domain,
            uri: source.uri,
            extractedOn: source.extracted_on,
            lastSeenOn: source.last_seen_on,
            stillOnPage: source.still_on_page,
          })),
        })),
        meta: {
          results: data.meta.results,
          limit: data.meta.limit,
          offset: data.meta.offset,
        },
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search domain emails',
      };
    }
  },
});
