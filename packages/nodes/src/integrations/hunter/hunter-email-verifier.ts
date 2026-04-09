import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  HunterEmailVerifierInputSchema,
  HunterEmailVerifierOutputSchema,
  type HunterEmailVerifierInput,
  type HunterEmailVerifierOutput,
} from './schemas.js';

export {
  HunterEmailVerifierInputSchema,
  HunterEmailVerifierOutputSchema,
  type HunterEmailVerifierInput,
  type HunterEmailVerifierOutput,
} from './schemas.js';

const HUNTER_API_BASE = 'https://api.hunter.io/v2';

interface HunterEmailVerifierResponse {
  data: {
    status: string;
    score: number;
    regexp: boolean;
    gibberish: boolean;
    disposable: boolean;
    webmail: boolean;
    mx_records: boolean;
    smtp_server: boolean;
    smtp_check: boolean;
    accept_all: boolean;
  };
}

export const hunterEmailVerifierNode = defineNode({
  type: 'hunter_email_verifier',
  name: 'Hunter Email Verifier',
  description: 'Verify the deliverability of an email address using Hunter.io',
  category: 'integration',
  inputSchema: HunterEmailVerifierInputSchema,
  outputSchema: HunterEmailVerifierOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: HunterEmailVerifierInput, context) => {
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
        email: input.email,
      });

      const response = await fetchWithRetry(
        `${HUNTER_API_BASE}/email-verifier?${params}`,
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

      const json = (await response.json()) as HunterEmailVerifierResponse;
      const data = json.data;

      const output: HunterEmailVerifierOutput = {
        status: data.status,
        score: data.score,
        regexp: data.regexp,
        gibberish: data.gibberish,
        disposable: data.disposable,
        webmail: data.webmail,
        mxRecords: data.mx_records,
        smtpServer: data.smtp_server,
        smtpCheck: data.smtp_check,
        acceptAll: data.accept_all,
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify email',
      };
    }
  },
});
