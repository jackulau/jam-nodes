import { z } from 'zod';
import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';

// =============================================================================
// Apollo API types (minimal projection of the `people/match` response)
// =============================================================================

interface ApolloMatchedPerson {
  id?: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  email_status?: string | null;
  organization?: {
    name?: string | null;
  } | null;
  organization_name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

interface ApolloMatchResponse {
  person?: ApolloMatchedPerson | null;
}

// =============================================================================
// Schemas
// =============================================================================

export const ApolloEnrichPersonInputSchema = z.object({
  email: z.string().email(),
});

export type ApolloEnrichPersonInput = z.infer<typeof ApolloEnrichPersonInputSchema>;

export const ApolloEnrichedPersonSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  emailStatus: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
});

export type ApolloEnrichedPerson = z.infer<typeof ApolloEnrichedPersonSchema>;

export const ApolloEnrichPersonOutputSchema = z.object({
  person: ApolloEnrichedPersonSchema.nullable(),
});

export type ApolloEnrichPersonOutput = z.infer<typeof ApolloEnrichPersonOutputSchema>;

// =============================================================================
// Mapping helper
// =============================================================================

function normalizePerson(raw: ApolloMatchedPerson): ApolloEnrichedPerson {
  const company = raw.organization?.name ?? raw.organization_name ?? null;
  const fullName =
    raw.name ??
    ([raw.first_name, raw.last_name].filter(Boolean).join(' ').trim() || null);

  return {
    id: raw.id ?? '',
    name: fullName,
    firstName: raw.first_name ?? null,
    lastName: raw.last_name ?? null,
    email: raw.email ?? null,
    title: raw.title ?? null,
    company,
    linkedinUrl: raw.linkedin_url ?? null,
    emailStatus: raw.email_status ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    country: raw.country ?? null,
  };
}

// =============================================================================
// Node definition
// =============================================================================

/**
 * Enrich a person by email address via Apollo.io's `people/match` endpoint.
 *
 * Sets `reveal_personal_emails: true` so the response includes the email field
 * reliably. On some Apollo plans this flag bills additional credits per call.
 */
export const apolloEnrichPersonNode = defineNode({
  type: 'apollo_enrich_person',
  name: 'Apollo Enrich Person',
  description: 'Enrich a person by email using Apollo.io People Match',
  category: 'integration',
  inputSchema: ApolloEnrichPersonInputSchema,
  outputSchema: ApolloEnrichPersonOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsEnrichment: true,
    supportsRerun: true,
  },

  executor: async (input, context) => {
    try {
      const apiKey = context.credentials?.apollo?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'Apollo API key not configured. Please provide context.credentials.apollo.apiKey.',
        };
      }

      const response = await fetchWithRetry(
        `${APOLLO_API_BASE}/people/match`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apiKey,
          },
          body: JSON.stringify({
            email: input.email,
            reveal_personal_emails: true,
          }),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Apollo API error: ${response.status} - ${errorText}`,
        };
      }

      const data: ApolloMatchResponse = await response.json();
      const raw = data.person;
      if (!raw) {
        return { success: true, output: { person: null } };
      }

      return { success: true, output: { person: normalizePerson(raw) } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enrich person',
      };
    }
  },
});
