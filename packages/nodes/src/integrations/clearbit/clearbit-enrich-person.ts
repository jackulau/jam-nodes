import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  ClearbitEnrichPersonInputSchema,
  ClearbitEnrichPersonOutputSchema,
  type ClearbitEnrichPersonInput,
  type ClearbitEnrichPersonOutput,
} from './schemas.js';

export {
  ClearbitEnrichPersonInputSchema,
  ClearbitEnrichPersonOutputSchema,
  type ClearbitEnrichPersonInput,
  type ClearbitEnrichPersonOutput,
} from './schemas.js';

const PERSON_ENRICH_URL = 'https://person-stream.clearbit.com/v2/people/find';

interface ClearbitPersonResponse {
  id?: string;
  name?: {
    fullName?: string | null;
    givenName?: string | null;
    familyName?: string | null;
  } | null;
  email?: string | null;
  location?: string | null;
  employment?: {
    domain?: string | null;
    name?: string | null;
    title?: string | null;
    role?: string | null;
    seniority?: string | null;
  } | null;
  linkedin?: { handle?: string | null } | null;
  twitter?: { handle?: string | null; followers?: number | null } | null;
  facebook?: { handle?: string | null } | null;
  github?: { handle?: string | null } | null;
}

export const clearbitEnrichPersonNode = defineNode({
  type: 'clearbit_enrich_person',
  name: 'Clearbit Enrich Person',
  description:
    'Enrich a person by email using Clearbit. Returns name, location, employment, and social profiles.',
  category: 'integration',
  inputSchema: ClearbitEnrichPersonInputSchema,
  outputSchema: ClearbitEnrichPersonOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: ClearbitEnrichPersonInput, context) => {
    try {
      const apiKey = context.credentials?.clearbit?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'Clearbit API key not configured. Please provide context.credentials.clearbit.apiKey.',
        };
      }

      const params = new URLSearchParams({ email: input.email });
      if (input.givenName) params.set('given_name', input.givenName);
      if (input.familyName) params.set('family_name', input.familyName);
      if (input.company) params.set('company', input.company);
      if (input.companyDomain) params.set('company_domain', input.companyDomain);
      if (input.linkedIn) params.set('linkedin', input.linkedIn);
      if (input.twitter) params.set('twitter', input.twitter);

      const response = await fetchWithRetry(
        `${PERSON_ENRICH_URL}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Clearbit API error: ${response.status} - ${errorText}`,
        };
      }

      const raw = (await response.json()) as ClearbitPersonResponse;

      if (typeof raw?.id !== 'string') {
        return {
          success: false,
          error: 'Clearbit API returned an invalid person response (missing id).',
        };
      }

      const output: ClearbitEnrichPersonOutput = {
        id: raw.id,
        name: {
          fullName: raw.name?.fullName ?? null,
          givenName: raw.name?.givenName ?? null,
          familyName: raw.name?.familyName ?? null,
        },
        email: raw.email ?? null,
        location: raw.location ?? null,
        employment: {
          domain: raw.employment?.domain ?? null,
          name: raw.employment?.name ?? null,
          title: raw.employment?.title ?? null,
          role: raw.employment?.role ?? null,
          seniority: raw.employment?.seniority ?? null,
        },
        social: {
          linkedin: raw.linkedin ? { handle: raw.linkedin.handle ?? null } : null,
          twitter: raw.twitter
            ? {
                handle: raw.twitter.handle ?? null,
                followers: raw.twitter.followers ?? null,
              }
            : null,
          facebook: raw.facebook ? { handle: raw.facebook.handle ?? null } : null,
          github: raw.github ? { handle: raw.github.handle ?? null } : null,
        },
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enrich person',
      };
    }
  },
});
