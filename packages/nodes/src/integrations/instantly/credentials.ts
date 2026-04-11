import { z } from 'zod';
import { defineBearerCredential } from '@jam-nodes/core';

export const instantlyCredential = defineBearerCredential({
  name: 'instantly',
  displayName: 'Instantly.ai API Key',
  documentationUrl: 'https://developer.instantly.ai/',
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
