import { z } from 'zod';
import { defineBearerCredential } from '@jam-nodes/core';

export const yelpCredential = defineBearerCredential({
  name: 'yelp',
  displayName: 'Yelp Fusion API Key',
  documentationUrl: 'https://docs.developer.yelp.com/docs/fusion-authentication',
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
