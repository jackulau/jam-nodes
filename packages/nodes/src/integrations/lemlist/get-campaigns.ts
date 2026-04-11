import { defineNode } from '@jam-nodes/core'
import { fetchWithRetry } from '../../utils/http.js'
import { LEMLIST_API_BASE, buildLemlistHeaders } from './utils.js'
import {
  LemlistGetCampaignsInputSchema,
  LemlistGetCampaignsOutputSchema,
  LemlistCampaignSchema,
  type LemlistGetCampaignsInput,
  type LemlistCampaign,
} from './schemas.js'

export const lemlistGetCampaignsNode = defineNode({
  type: 'lemlist_get_campaigns',
  name: 'Lemlist Get Campaigns',
  description: 'List all Lemlist campaigns for the authenticated team',
  category: 'integration',
  inputSchema: LemlistGetCampaignsInputSchema,
  outputSchema: LemlistGetCampaignsOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: LemlistGetCampaignsInput, context) => {
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
      if (input.limit !== undefined) params.set('limit', String(input.limit))
      if (input.offset !== undefined) params.set('offset', String(input.offset))
      if (input.page !== undefined) params.set('page', String(input.page))
      if (input.status !== undefined) params.set('status', input.status)
      if (input.sortBy !== undefined) params.set('sortBy', input.sortBy)
      if (input.sortOrder !== undefined)
        params.set('sortOrder', input.sortOrder)

      const response = await fetchWithRetry(
        `${LEMLIST_API_BASE}/campaigns?${params.toString()}`,
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

      const data = (await response.json()) as LemlistCampaign[]
      const campaigns = data.map((c) => LemlistCampaignSchema.parse(c))

      return {
        success: true,
        output: {
          campaigns,
          count: campaigns.length,
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
