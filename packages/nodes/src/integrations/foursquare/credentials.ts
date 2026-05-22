import { z } from 'zod';
import { defineApiKeyCredential } from '@jam-nodes/core';

export const foursquareCredential = defineApiKeyCredential({
  name: 'foursquare',
  displayName: 'Foursquare Places API Key',
  documentationUrl: 'https://docs.foursquare.com/developer/reference/places-api-overview',
  schema: z.object({
    apiKey: z.string(),
  }),
  authenticate: {
    type: 'header',
    properties: {
      Authorization: '{{apiKey}}',
    },
  },
});
