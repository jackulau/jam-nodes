import { z } from 'zod';
import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';

// =============================================================================
// Apollo API types
// =============================================================================

interface ApolloOrganization {
  id?: string;
  name?: string | null;
  website_url?: string | null;
  linkedin_url?: string | null;
  industry?: string | null;
  estimated_num_employees?: number | null;
  founded_year?: number | null;
  primary_domain?: string | null;
}

interface ApolloOrganizationResponse {
  organization?: ApolloOrganization | null;
}

// =============================================================================
// Schemas
// =============================================================================

export const ApolloEnrichCompanyInputSchema = z.object({
  domain: z.string().min(1),
});

export type ApolloEnrichCompanyInput = z.infer<typeof ApolloEnrichCompanyInputSchema>;

export const ApolloEnrichedOrganizationSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  industry: z.string().nullable(),
  estimatedNumEmployees: z.number().nullable(),
  foundedYear: z.number().nullable(),
  primaryDomain: z.string().nullable(),
});

export type ApolloEnrichedOrganization = z.infer<
  typeof ApolloEnrichedOrganizationSchema
>;

export const ApolloEnrichCompanyOutputSchema = z.object({
  organization: ApolloEnrichedOrganizationSchema.nullable(),
});

export type ApolloEnrichCompanyOutput = z.infer<
  typeof ApolloEnrichCompanyOutputSchema
>;

// =============================================================================
// Mapping helper
// =============================================================================

function normalizeOrganization(raw: ApolloOrganization): ApolloEnrichedOrganization {
  return {
    id: raw.id ?? '',
    name: raw.name ?? null,
    websiteUrl: raw.website_url ?? null,
    linkedinUrl: raw.linkedin_url ?? null,
    industry: raw.industry ?? null,
    estimatedNumEmployees: raw.estimated_num_employees ?? null,
    foundedYear: raw.founded_year ?? null,
    primaryDomain: raw.primary_domain ?? null,
  };
}

// =============================================================================
// Node definition
// =============================================================================

export const apolloEnrichCompanyNode = defineNode({
  type: 'apollo_enrich_company',
  name: 'Apollo Enrich Company',
  description: 'Enrich a company by domain using Apollo.io Organization Enrichment',
  category: 'integration',
  inputSchema: ApolloEnrichCompanyInputSchema,
  outputSchema: ApolloEnrichCompanyOutputSchema,
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

      const url = `${APOLLO_API_BASE}/organizations/enrich?domain=${encodeURIComponent(input.domain)}`;
      const response = await fetchWithRetry(
        url,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apiKey,
          },
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

      const data: ApolloOrganizationResponse = await response.json();
      const raw = data.organization;
      if (!raw) {
        return { success: true, output: { organization: null } };
      }

      return {
        success: true,
        output: { organization: normalizeOrganization(raw) },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enrich company',
      };
    }
  },
});
