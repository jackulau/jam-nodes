import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  ClearbitCompanyAutocompleteInputSchema,
  ClearbitCompanyAutocompleteOutputSchema,
  type ClearbitCompanyAutocompleteInput,
  type ClearbitCompanyAutocompleteOutput,
} from './schemas.js';

export {
  ClearbitCompanyAutocompleteInputSchema,
  ClearbitCompanyAutocompleteOutputSchema,
  type ClearbitCompanyAutocompleteInput,
  type ClearbitCompanyAutocompleteOutput,
} from './schemas.js';

const AUTOCOMPLETE_URL = 'https://autocomplete.clearbit.com/v1/companies/suggest';

interface ClearbitAutocompleteEntry {
  name?: string;
  domain?: string;
  logo?: string;
}

export const clearbitCompanyAutocompleteNode = defineNode({
  type: 'clearbit_company_autocomplete',
  name: 'Clearbit Company Autocomplete',
  description:
    'Autocomplete company names via Clearbit. Returns matching companies with name, domain, and logo.',
  category: 'integration',
  inputSchema: ClearbitCompanyAutocompleteInputSchema,
  outputSchema: ClearbitCompanyAutocompleteOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: ClearbitCompanyAutocompleteInput, context) => {
    try {
      const apiKey = context.credentials?.clearbit?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'Clearbit API key not configured. Please provide context.credentials.clearbit.apiKey.',
        };
      }

      const params = new URLSearchParams({ query: input.name });

      const response = await fetchWithRetry(
        `${AUTOCOMPLETE_URL}?${params.toString()}`,
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

      const raw = (await response.json()) as unknown;

      if (!Array.isArray(raw)) {
        return {
          success: false,
          error: 'Clearbit autocomplete returned an invalid response (expected array).',
        };
      }

      const companies = (raw as ClearbitAutocompleteEntry[]).map((entry) => ({
        name: entry.name ?? '',
        domain: entry.domain ?? '',
        logo: entry.logo ?? '',
      }));

      const output: ClearbitCompanyAutocompleteOutput = { companies };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to autocomplete company',
      };
    }
  },
});
