import { z } from 'zod';
import { defineBearerCredential } from '@jam-nodes/core';

export const notionCredential = defineBearerCredential({
  name: 'notion',
  displayName: 'Notion Integration Token',
  documentationUrl: 'https://developers.notion.com/docs/authorization',
  schema: z.object({
    apiToken: z
      .string()
      .min(1)
      .regex(
        /^[^\r\n\t\v\f\0]+$/,
        'apiToken must not contain whitespace control characters (\\r, \\n, \\t, \\v, \\f, \\0). Stripping them would also break bearer tokens containing those bytes.'
      ),
  }),
  authenticate: {
    type: 'header',
    properties: {
      Authorization: 'Bearer {{apiToken}}',
      'Notion-Version': '2022-06-28',
    },
  },
});
