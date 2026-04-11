import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry, sleep } from '../../utils/http.js';
import {
  DropcontactEnrichInputSchema,
  DropcontactEnrichOutputSchema,
  type DropcontactEnrichInput,
  type DropcontactEnrichOutput,
} from './schemas.js';

const DROPCONTACT_API_BASE = 'https://api.dropcontact.io';
const POLL_INTERVAL_MS = 5000;

interface DropcontactSubmitResponse {
  success?: boolean;
  request_id?: string;
  reason?: string;
  error?: string | boolean;
  credits_left?: number;
}

interface DropcontactPollResponse {
  success?: boolean;
  reason?: string;
  error?: string | boolean;
  credits_left?: number;
  data?: unknown[];
}

function getString(obj: unknown, key: string): string | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function errorMessage(body: { reason?: string; error?: string | boolean }, fallback: string): string {
  if (typeof body.reason === 'string' && body.reason.length > 0) return body.reason;
  if (typeof body.error === 'string' && body.error.length > 0) return body.error;
  return fallback;
}

function buildSubmitBody(input: DropcontactEnrichInput): Record<string, unknown> {
  const contact: Record<string, unknown> = {};
  if (input.email !== undefined) contact['email'] = input.email;
  if (input.firstName !== undefined) contact['first_name'] = input.firstName;
  if (input.lastName !== undefined) contact['last_name'] = input.lastName;
  if (input.fullName !== undefined) contact['full_name'] = input.fullName;
  if (input.company !== undefined) contact['company'] = input.company;
  if (input.website !== undefined) contact['website'] = input.website;
  if (input.linkedinUrl !== undefined) contact['linkedin'] = input.linkedinUrl;
  if (input.phone !== undefined) contact['phone'] = input.phone;

  return {
    data: [contact],
    siren: input.siren,
    language: input.language,
  };
}

async function submitBatch(
  apiKey: string,
  input: DropcontactEnrichInput
): Promise<{ requestId: string; creditsLeft: number | null }> {
  const response = await fetchWithRetry(
    `${DROPCONTACT_API_BASE}/batch`,
    {
      method: 'POST',
      headers: {
        'X-Access-Token': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildSubmitBody(input)),
    },
    { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dropcontact submit error: ${response.status} - ${text}`);
  }

  const body = (await response.json()) as DropcontactSubmitResponse;

  if (body.success === false) {
    throw new Error(errorMessage(body, 'Dropcontact submission failed'));
  }

  if (typeof body.request_id !== 'string' || body.request_id.length === 0) {
    throw new Error('Dropcontact submit response missing request_id');
  }

  return {
    requestId: body.request_id,
    creditsLeft: typeof body.credits_left === 'number' ? body.credits_left : null,
  };
}

async function getBatchResult(
  apiKey: string,
  requestId: string
): Promise<DropcontactPollResponse> {
  const url = `${DROPCONTACT_API_BASE}/batch/${encodeURIComponent(requestId)}?api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetchWithRetry(
    url,
    { method: 'GET' },
    { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dropcontact poll error: ${response.status} - ${text}`);
  }

  return (await response.json()) as DropcontactPollResponse;
}

async function pollForResults(
  apiKey: string,
  requestId: string,
  timeoutMs: number
): Promise<{ record: unknown; creditsLeft: number | null }> {
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / POLL_INTERVAL_MS));

  // Fetch-first polling: poll immediately on attempt 0, then sleep between attempts.
  // Sleep-first would waste the entire poll budget on `timeout: 1` (one attempt, spent sleeping).
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const body = await getBatchResult(apiKey, requestId);

    if (body.success === false) {
      throw new Error(errorMessage(body, 'Dropcontact enrichment failed'));
    }

    const hasData =
      body.success === true && Array.isArray(body.data) && body.data.length > 0;

    if (hasData) {
      return {
        record: (body.data as unknown[])[0],
        creditsLeft: typeof body.credits_left === 'number' ? body.credits_left : null,
      };
    }

    // Still processing. Sleep before the next attempt unless this was the last.
    if (attempt < maxAttempts - 1) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  throw new Error(`Dropcontact polling timed out after ${Math.round(timeoutMs / 1000)}s`);
}

function mapEnrichedRecord(
  raw: unknown,
  requestId: string,
  creditsLeft: number | null
): DropcontactEnrichOutput {
  return {
    requestId,
    success: true,
    creditsLeft,
    email: getString(raw, 'email'),
    firstName: getString(raw, 'first_name'),
    lastName: getString(raw, 'last_name'),
    fullName: getString(raw, 'full_name'),
    civility: getString(raw, 'civility'),
    company: getString(raw, 'company'),
    website: getString(raw, 'website'),
    linkedin: getString(raw, 'linkedin'),
    phone: getString(raw, 'phone'),
    mobilePhone: getString(raw, 'mobile_phone'),
    siren: getString(raw, 'siren'),
  };
}

export {
  DropcontactEnrichInputSchema,
  DropcontactEnrichOutputSchema,
  type DropcontactEnrichInput,
  type DropcontactEnrichOutput,
} from './schemas.js';

/**
 * Dropcontact Enrich Contact Node
 *
 * Submits a single contact to Dropcontact's async /batch endpoint and polls
 * /batch/{request_id} until enrichment results are available or the timeout
 * is reached. Returns the enriched contact fields with all unresolved fields
 * set to `null`.
 */
export const dropcontactEnrichNode = defineNode({
  type: 'dropcontact_enrich',
  name: 'Dropcontact Enrich Contact',
  description:
    'Enrich a B2B contact via Dropcontact (GDPR-compliant). Submits to /batch and polls until results are ready.',
  category: 'integration',
  inputSchema: DropcontactEnrichInputSchema,
  outputSchema: DropcontactEnrichOutputSchema,
  estimatedDuration: 30,
  capabilities: {
    supportsRerun: true,
  },

  executor: async (input: DropcontactEnrichInput, context) => {
    const apiKey = context.credentials?.dropcontact?.apiKey;
    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      return {
        success: false,
        error:
          'Dropcontact API key not configured. Please provide context.credentials.dropcontact.apiKey.',
      };
    }

    try {
      const { requestId, creditsLeft: submitCredits } = await submitBatch(apiKey, input);
      const { record, creditsLeft: pollCredits } = await pollForResults(
        apiKey,
        requestId,
        input.timeout * 1000
      );

      const creditsLeft = pollCredits ?? submitCredits;
      const output = mapEnrichedRecord(record, requestId, creditsLeft);

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to enrich contact with Dropcontact',
      };
    }
  },
});
