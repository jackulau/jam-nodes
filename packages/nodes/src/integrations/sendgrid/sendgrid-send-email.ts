import { defineNode } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';
import {
  SendgridSendEmailInputSchema,
  SendgridSendEmailOutputSchema,
  type SendgridSendEmailInput,
  type SendgridSendEmailOutput,
  type SendgridAttachment,
} from './schemas.js';

export {
  SendgridSendEmailInputSchema,
  SendgridSendEmailOutputSchema,
  type SendgridSendEmailInput,
  type SendgridSendEmailOutput,
} from './schemas.js';

const SENDGRID_API_BASE = 'https://api.sendgrid.com/v3';

type SendgridPersonalization = {
  to: Array<{ email: string }>;
  cc?: Array<{ email: string }>;
  bcc?: Array<{ email: string }>;
  dynamic_template_data?: Record<string, unknown>;
};

type SendgridMailSendBody = {
  personalizations: SendgridPersonalization[];
  from: { email: string };
  subject: string;
  content?: Array<{ type: string; value: string }>;
  template_id?: string;
  reply_to?: { email: string };
  send_at?: number;
  attachments?: Array<{
    content: string;
    filename: string;
    type: string;
    disposition?: string;
    content_id?: string;
  }>;
};

function toEmailObjects(to: string | string[]): Array<{ email: string }> {
  const emails = Array.isArray(to) ? to : [to];
  return emails.map((email) => ({ email }));
}

function mapAttachments(attachments: SendgridAttachment[]): SendgridMailSendBody['attachments'] {
  return attachments.map((att) => ({
    content: att.content,
    filename: att.filename,
    type: att.type,
    ...(att.disposition !== undefined ? { disposition: att.disposition } : {}),
    ...(att.contentId !== undefined ? { content_id: att.contentId } : {}),
  }));
}

export const sendgridSendEmailNode = defineNode({
  type: 'sendgrid_send_email',
  name: 'SendGrid Send Email',
  description:
    'Send a transactional email via SendGrid with template and attachment support',
  category: 'integration',
  inputSchema: SendgridSendEmailInputSchema,
  outputSchema: SendgridSendEmailOutputSchema,
  estimatedDuration: 5,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: SendgridSendEmailInput, context) => {
    try {
      const apiKey = context.credentials?.sendgrid?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          error:
            'SendGrid API key not configured. Please provide context.credentials.sendgrid.apiKey.',
        };
      }

      const personalization: SendgridPersonalization = {
        to: toEmailObjects(input.to),
      };
      if (input.cc && input.cc.length > 0) {
        personalization.cc = input.cc.map((email) => ({ email }));
      }
      if (input.bcc && input.bcc.length > 0) {
        personalization.bcc = input.bcc.map((email) => ({ email }));
      }
      if (input.templateId && input.dynamicTemplateData) {
        personalization.dynamic_template_data = input.dynamicTemplateData;
      }

      const body: SendgridMailSendBody = {
        personalizations: [personalization],
        from: { email: input.from },
        subject: input.subject,
      };

      if (input.templateId) {
        body.template_id = input.templateId;
      } else {
        body.content = [{ type: input.content.type, value: input.content.value }];
      }

      if (input.replyTo) {
        body.reply_to = { email: input.replyTo };
      }
      if (input.sendAt !== undefined) {
        body.send_at = input.sendAt;
      }
      if (input.attachments && input.attachments.length > 0) {
        body.attachments = mapAttachments(input.attachments);
      }

      const response = await fetchWithRetry(
        `${SENDGRID_API_BASE}/mail/send`,
        {
          method: 'POST',
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
          error: `SendGrid send failed: ${response.status} ${errorBody}`.trim(),
        };
      }

      const messageId = response.headers.get('x-message-id') ?? '';
      const output: SendgridSendEmailOutput = {
        messageId,
        status: input.sendAt !== undefined ? 'scheduled' : 'sent',
      };

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send SendGrid email',
      };
    }
  },
});
