import { defineNode } from '@jam-nodes/core'
import { fetchWithRetry } from '../../utils/http.js'
import { LEMLIST_API_BASE, buildLemlistHeaders } from './utils.js'
import {
  LemlistMarkAsInterestedInputSchema,
  LemlistMarkAsInterestedOutputSchema,
  LemlistLeadSchema,
  type LemlistMarkAsInterestedInput,
  type LemlistLead,
} from './schemas.js'

export const lemlistMarkAsInterestedNode = defineNode({
  type: 'lemlist_mark_as_interested',
  name: 'Lemlist Mark Lead as Interested',
  description: 'Mark a Lemlist lead as interested in a specific campaign',
  category: 'integration',
  inputSchema: LemlistMarkAsInterestedInputSchema,
  outputSchema: LemlistMarkAsInterestedOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: LemlistMarkAsInterestedInput, context) => {
    try {
      const apiKey = context.credentials?.lemlist?.apiKey
      if (!apiKey) {
        return {
          success: false,
          error:
            'Lemlist API key not configured. Please provide context.credentials.lemlist.apiKey.',
        }
      }

      const campaignId = encodeURIComponent(input.campaignId)
      const leadIdOrEmail = encodeURIComponent(input.leadIdOrEmail)
      const url = `${LEMLIST_API_BASE}/campaigns/${campaignId}/leads/${leadIdOrEmail}/interested`

      const response = await fetchWithRetry(
        url,
        {
          method: 'POST',
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

      const data = (await response.json()) as LemlistLead
      return {
        success: true,
        output: LemlistLeadSchema.parse(data),
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
})
