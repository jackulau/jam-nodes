import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  SendgridCreateContactInputSchema,
  SendgridCreateContactOutputSchema,
  type SendgridCreateContactInput,
  type SendgridCreateContactOutput,
} from './schemas.js';

export {
  SendgridCreateContactInputSchema,
  SendgridCreateContactOutputSchema,
  type SendgridCreateContactInput,
  type SendgridCreateContactOutput,
} from './schemas.js';

const SENDGRID_API_BASE = 'https://api.sendgrid.com/v3';

type SendgridContactUpsertBody = {
  list_ids?: string[];
  contacts: Array<{
    email: string;
    first_name?: string;
    last_name?: string;
    custom_fields?: Record<string, unknown>;
  }>;
};

type SendgridContactUpsertResponse = {
  job_id?: string;
};

export const sendgridCreateContactNode = defineNode({
  type: 'sendgrid_create_contact',
  name: 'SendGrid Create Contact',
  description:
    'Upsert a contact in SendGrid Marketing Contacts (returns a job_id for async status polling)',
  category: 'integration',
  inputSchema: SendgridCreateContactInputSchema,
  outputSchema: SendgridCreateContactOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: SendgridCreateContactInput, context) => {
    try {
      const apiKey = context.credentials?.sendgrid?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'SendGrid API key not configured. Please provide context.credentials.sendgrid.apiKey.',
        };
      }

      const contact: SendgridContactUpsertBody['contacts'][number] = {
        email: input.email,
      };
      if (input.firstName !== undefined) contact.first_name = input.firstName;
      if (input.lastName !== undefined) contact.last_name = input.lastName;
      if (input.customFields !== undefined) contact.custom_fields = input.customFields;

      const body: SendgridContactUpsertBody = {
        contacts: [contact],
      };
      if (input.listIds && input.listIds.length > 0) {
        body.list_ids = input.listIds;
      }

      const response = await fetchWithRetry(
        `${SENDGRID_API_BASE}/marketing/contacts`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
      );

      if (response.status < 200 || response.status >= 300) {
        const errorBody = await response.text().catch(() => '');
        return {
          success: false,
          error: `SendGrid create contact failed: ${response.status} ${errorBody}`.trim(),
        };
      }

      const data = (await response.json().catch(() => ({}))) as SendgridContactUpsertResponse;
      if (!data.job_id) {
        return {
          success: false,
          error: 'SendGrid upsert response missing job_id',
        };
      }

      const output: SendgridCreateContactOutput = {
        contactJobId: data.job_id,
        email: input.email,
        status: 'queued',
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upsert SendGrid contact',
      };
    }
  },
});
