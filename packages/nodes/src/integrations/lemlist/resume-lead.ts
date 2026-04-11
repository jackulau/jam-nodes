import { defineNode } from '@jam-nodes/core'
import { fetchWithRetry } from '../../utils/http.js'
import { LEMLIST_API_BASE, buildLemlistHeaders } from './utils.js'
import {
  LemlistResumeLeadInputSchema,
  LemlistResumeLeadOutputSchema,
  LemlistLeadSchema,
  type LemlistResumeLeadInput,
  type LemlistLead,
} from './schemas.js'

export const lemlistResumeLeadNode = defineNode({
  type: 'lemlist_resume_lead',
  name: 'Lemlist Resume Lead',
  description:
    'Resume outreach to a paused Lemlist lead in all campaigns or a single campaign',
  category: 'integration',
  inputSchema: LemlistResumeLeadInputSchema,
  outputSchema: LemlistResumeLeadOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: LemlistResumeLeadInput, context) => {
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
      let url = `${LEMLIST_API_BASE}/leads/start/${leadId}`
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
