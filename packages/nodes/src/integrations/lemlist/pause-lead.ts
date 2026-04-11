import { defineNode } from '@jam-nodes/core'
import { fetchWithRetry } from '../../utils/http.js'
import { LEMLIST_API_BASE, buildLemlistHeaders } from './utils.js'
import {
  LemlistPauseLeadInputSchema,
  LemlistPauseLeadOutputSchema,
  LemlistLeadSchema,
  type LemlistPauseLeadInput,
  type LemlistLead,
} from './schemas.js'

export const lemlistPauseLeadNode = defineNode({
  type: 'lemlist_pause_lead',
  name: 'Lemlist Pause Lead',
  description:
    'Pause outreach to a specific Lemlist lead in all campaigns or a single campaign',
  category: 'integration',
  inputSchema: LemlistPauseLeadInputSchema,
  outputSchema: LemlistPauseLeadOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: LemlistPauseLeadInput, context) => {
    try {
      const apiKey = context.credentials?.lemlist?.apiKey
      if (!apiKey) {
        return {
          success: false,
          error:
            'Lemlist API key not configured. Please provide context.credentials.lemlist.apiKey.',
        }
      }

      const leadId = encodeURIComponent(input.leadId)
      let url = `${LEMLIST_API_BASE}/leads/pause/${leadId}`
      if (input.campaignId !== undefined) {
        const params = new URLSearchParams({ campaignId: input.campaignId })
        url += `?${params.toString()}`
      }

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

      const data = (await response.json()) as LemlistLead[]
      const leads = data.map((l) => LemlistLeadSchema.parse(l))

      return {
        success: true,
        output: { leads },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
})
