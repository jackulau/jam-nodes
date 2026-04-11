import { z } from 'zod';
import { defineApiKeyCredential } from '@jam-nodes/core';

export const clearbitCredential = defineApiKeyCredential({
  name: 'clearbit',
  displayName: 'Clearbit API',
  documentationUrl: 'https://clearbit.com/docs',
  schema: z.object({
    apiKey: z.string(),
  }),
  authenticate: {
    type: 'header',
    properties: {
      Authorization: 'Bearer {{apiKey}}',
    },
  },
});
