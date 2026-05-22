import { z } from 'zod';
import { defineApiKeyCredential } from '@jam-nodes/core';

export const googlePlacesCredential = defineApiKeyCredential({
  name: 'googlePlaces',
  displayName: 'Google Places API Key',
  documentationUrl: 'https://developers.google.com/maps/documentation/places/web-service/get-api-key',
  schema: z.object({
    apiKey: z.string(),
  }),
  authenticate: {
    type: 'header',
    properties: {
      'X-Goog-Api-Key': '{{apiKey}}',
    },
  },
});
