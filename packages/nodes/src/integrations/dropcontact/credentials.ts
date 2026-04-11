import { z } from 'zod';
import { defineApiKeyCredential } from '@jam-nodes/core';

export const dropcontactCredential = defineApiKeyCredential({
  name: 'dropcontact',
  displayName: 'Dropcontact API',
  documentationUrl: 'https://developer.dropcontact.io/',
  schema: z.object({
    apiKey: z.string().min(1, 'API key is required'),
  }),
  authenticate: {
    type: 'header',
    properties: {
      'X-Access-Token': '{{apiKey}}',
    },
  },
  testRequest: {
    url: 'https://api.dropcontact.io/batch',
    method: 'GET',
  },
});
