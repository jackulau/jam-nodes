import { defineBearerCredential } from '@jam-nodes/core';
import { z } from 'zod';

export const airtableCredential = defineBearerCredential({
  name: 'airtable',
  displayName: 'Airtable API Token',
  documentationUrl: 'https://airtable.com/developers/web/api/introduction',
  schema: z.object({
    accessToken: z.string(),
  }),
  authenticate: {
    type: 'header',
    properties: {
      Authorization: 'Bearer {{accessToken}}',
    },
  },
});
