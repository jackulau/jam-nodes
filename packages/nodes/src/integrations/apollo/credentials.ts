import { z } from 'zod'
import { defineApiKeyCredential } from '@jam-nodes/core'

export const apolloCredential = defineApiKeyCredential({
  name: 'apollo',
  displayName: 'Apollo.io API Key',
  documentationUrl: 'https://apolloio.github.io/apollo-api-docs/',
  schema: z.object({
    apiKey: z.string(),
  }),
  authenticate: {
    type: 'header',
    properties: {
      'X-Api-Key': '{{apiKey}}',
    },
  },
})
