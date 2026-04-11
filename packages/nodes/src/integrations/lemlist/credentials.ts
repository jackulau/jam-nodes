import { z } from 'zod'
import { defineApiKeyCredential } from '@jam-nodes/core'

export const lemlistCredential = defineApiKeyCredential({
  name: 'lemlist',
  displayName: 'Lemlist API Key',
  documentationUrl: 'https://developer.lemlist.com/',
  schema: z.object({
    apiKey: z.string().min(1),
  }),
  authenticate: {
    type: 'header',
    properties: {
      Authorization: 'Basic {{apiKey}}',
    },
  },
})
