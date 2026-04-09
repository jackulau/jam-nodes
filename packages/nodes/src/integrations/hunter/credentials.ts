import { defineApiKeyCredential } from '@jam-nodes/core';
import { z } from 'zod';

export const hunterCredential = defineApiKeyCredential({
  name: 'hunter',
  displayName: 'Hunter.io API Key',
  documentationUrl: 'https://hunter.io/api-documentation/v2',
  schema: z.object({
    apiKey: z.string(),
  }),
  authenticate: {
    type: 'query',
    properties: {
      api_key: '{{apiKey}}',
    },
  },
  testRequest: {
    url: 'https://api.hunter.io/v2/account',
    method: 'GET',
  },
});
