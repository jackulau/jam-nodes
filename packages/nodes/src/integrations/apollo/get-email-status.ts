import { z } from 'zod';
import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';

// =============================================================================
// Schemas
// =============================================================================

export const ApolloGetEmailStatusInputSchema = z.object({
  email: z.string().email(),
});

export type ApolloGetEmailStatusInput = z.infer<
  typeof ApolloGetEmailStatusInputSchema
>;

export const ApolloEmailStatusSchema = z.enum(['valid', 'invalid', 'unknown']);
export type ApolloEmailStatus = z.infer<typeof ApolloEmailStatusSchema>;

export const ApolloGetEmailStatusOutputSchema = z.object({
  status: ApolloEmailStatusSchema,
  deliverability: z.string().nullable(),
});

export type ApolloGetEmailStatusOutput = z.infer<
  typeof ApolloGetEmailStatusOutputSchema
>;

// =============================================================================
// Status mapping helper (exported for direct unit testing)
// =============================================================================

/**
 * Map an Apollo `email_status` value to a normalized deliverability verdict.
 *
 * Apollo returns strings like `"verified"`, `"unverified"`, `"likely_to_bounce"`,
 * `"bounced"`, `"catch-all"`, etc. Anything we do not explicitly recognize as
 * valid or invalid defaults to `"unknown"` so callers never see a surprising
 * verdict.
 */
export function mapApolloEmailStatus(
  raw: string | null | undefined,
): ApolloEmailStatus {
  if (!raw) return 'unknown';
  const value = raw.toLowerCase();
  if (value === 'verified') return 'valid';
  if (value === 'unverified' || value === 'invalid') return 'invalid';
  if (value === 'likely_to_bounce' || value === 'bounced') return 'invalid';
  return 'unknown';
}

// =============================================================================
// Apollo API types
// =============================================================================

interface ApolloMatchedPersonStatus {
  email_status?: string | null;
}

interface ApolloMatchResponse {
  person?: ApolloMatchedPersonStatus | null;
}

// =============================================================================
// Node definition
// =============================================================================

/**
 * Get Apollo.io email deliverability verdict for an email address.
 *
 * Implementation note: Apollo's dedicated email-verification endpoint is gated
 * on some plans. This node reuses `POST /people/match` (the same endpoint used
 * by `apolloEnrichPersonNode`) and maps `person.email_status` to a normalized
 * verdict. If a workflow needs both the full person object and the status,
 * prefer calling `apolloEnrichPersonNode` directly and reading `emailStatus`
 * from its output — a single request will cover both needs.
 */
export const apolloGetEmailStatusNode = defineNode({
  type: 'apollo_get_email_status',
  name: 'Apollo Get Email Status',
  description: 'Get Apollo.io deliverability verdict for an email address',
  category: 'integration',
  inputSchema: ApolloGetEmailStatusInputSchema,
  outputSchema: ApolloGetEmailStatusOutputSchema,
  estimatedDuration: 2,
  capabilities: {
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
      const rawStatus = data.person?.email_status ?? null;
      const status = mapApolloEmailStatus(rawStatus);
      const deliverability = rawStatus && rawStatus.length > 0 ? rawStatus : null;

      return {
        success: true,
        output: { status, deliverability },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to get email status',
      };
    }
  },
});
