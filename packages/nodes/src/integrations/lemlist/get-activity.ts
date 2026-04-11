import { defineNode } from '@jam-nodes/core'
import { fetchWithRetry } from '../../utils/http.js'
import { LEMLIST_API_BASE, buildLemlistHeaders } from './utils.js'
import {
  LemlistGetActivityInputSchema,
  LemlistGetActivityOutputSchema,
  LemlistActivitySchema,
  type LemlistGetActivityInput,
  type LemlistActivity,
} from './schemas.js'

export const lemlistGetActivityNode = defineNode({
  type: 'lemlist_get_activity',
  name: 'Lemlist Get Activity',
  description:
    'Retrieve Lemlist campaign activity events (emails opened, clicked, replied, paused, etc.)',
  category: 'integration',
  inputSchema: LemlistGetActivityInputSchema,
  outputSchema: LemlistGetActivityOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: LemlistGetActivityInput, context) => {
    try {
      const apiKey = context.credentials?.lemlist?.apiKey
      if (!apiKey) {
        return {
          success: false,
          error:
            'Lemlist API key not configured. Please provide context.credentials.lemlist.apiKey.',
        }
      }

      const params = new URLSearchParams({ version: 'v2' })
      if (input.campaignId !== undefined)
        params.set('campaignId', input.campaignId)
      if (input.leadId !== undefined) params.set('leadId', input.leadId)
      if (input.type !== undefined) params.set('type', input.type)
      if (input.isFirst !== undefined)
        params.set('isFirst', String(input.isFirst))
      if (input.limit !== undefined) params.set('limit', String(input.limit))
      if (input.offset !== undefined) params.set('offset', String(input.offset))

      const response = await fetchWithRetry(
        `${LEMLIST_API_BASE}/activities?${params.toString()}`,
        {
          method: 'GET',
          headers: buildLemlistHeaders(apiKey),
        },
        { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 },
      )

      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false,
          error: `Lemlist API error ${response.status}: ${errorText}`,
        }
      }

      const data = (await response.json()) as LemlistActivity[]
      const activities = data.map((a) => LemlistActivitySchema.parse(a))

      return {
        success: true,
        output: {
          activities,
          count: activities.length,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
})
