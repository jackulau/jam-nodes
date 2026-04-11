import { defineApiKeyCredential } from '@jam-nodes/core';
import { z } from 'zod';

export const sendgridCredential = defineApiKeyCredential({
  name: 'sendgrid',
  displayName: 'SendGrid API',
  documentationUrl: 'https://docs.sendgrid.com/api-reference',
  schema: z.object({
    apiKey: z.string().min(1, 'SendGrid API key is required'),
  }),
  authenticate: {
    type: 'header',
    properties: {
      Authorization: 'Bearer {{apiKey}}',
    },
  },
});
