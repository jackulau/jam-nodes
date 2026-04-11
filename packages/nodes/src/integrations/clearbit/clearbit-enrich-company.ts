import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  ClearbitEnrichCompanyInputSchema,
  ClearbitEnrichCompanyOutputSchema,
  type ClearbitEnrichCompanyInput,
  type ClearbitEnrichCompanyOutput,
} from './schemas.js';

export {
  ClearbitEnrichCompanyInputSchema,
  ClearbitEnrichCompanyOutputSchema,
  type ClearbitEnrichCompanyInput,
  type ClearbitEnrichCompanyOutput,
} from './schemas.js';

const COMPANY_ENRICH_URL = 'https://company-stream.clearbit.com/v2/companies/find';

interface ClearbitCompanyResponse {
  id?: string;
  name?: string | null;
  domain?: string | null;
  category?: {
    sector?: string | null;
    industryGroup?: string | null;
    industry?: string | null;
    subIndustry?: string | null;
  } | null;
  metrics?: {
    employees?: number | null;
    employeesRange?: string | null;
    raised?: number | null;
    marketCap?: number | null;
    annualRevenue?: number | null;
    alexaUsRank?: number | null;
    alexaGlobalRank?: number | null;
  } | null;
  linkedin?: { handle?: string | null } | null;
  twitter?: { handle?: string | null; followers?: number | null } | null;
  facebook?: { handle?: string | null } | null;
}

export const clearbitEnrichCompanyNode = defineNode({
  type: 'clearbit_enrich_company',
  name: 'Clearbit Enrich Company',
  description:
    'Enrich a company by domain using Clearbit. Returns name, category, metrics, and social profiles.',
  category: 'integration',
  inputSchema: ClearbitEnrichCompanyInputSchema,
  outputSchema: ClearbitEnrichCompanyOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: ClearbitEnrichCompanyInput, context) => {
    try {
      const apiKey = context.credentials?.clearbit?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'Clearbit API key not configured. Please provide context.credentials.clearbit.apiKey.',
        };
      }

      const params = new URLSearchParams({ domain: input.domain });

      const response = await fetchWithRetry(
        `${COMPANY_ENRICH_URL}?${params.toString()}`,
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

      const raw = (await response.json()) as ClearbitCompanyResponse;

      if (typeof raw?.id !== 'string') {
        return {
          success: false,
          error: 'Clearbit API returned an invalid company response (missing id).',
        };
      }

      const output: ClearbitEnrichCompanyOutput = {
        id: raw.id,
        name: raw.name ?? null,
        domain: raw.domain ?? null,
        category: {
          sector: raw.category?.sector ?? null,
          industryGroup: raw.category?.industryGroup ?? null,
          industry: raw.category?.industry ?? null,
          subIndustry: raw.category?.subIndustry ?? null,
        },
        metrics: {
          employees: raw.metrics?.employees ?? null,
          employeesRange: raw.metrics?.employeesRange ?? null,
          raised: raw.metrics?.raised ?? null,
          marketCap: raw.metrics?.marketCap ?? null,
          annualRevenue: raw.metrics?.annualRevenue ?? null,
          alexaUsRank: raw.metrics?.alexaUsRank ?? null,
          alexaGlobalRank: raw.metrics?.alexaGlobalRank ?? null,
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
        },
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enrich company',
      };
    }
  },
});
