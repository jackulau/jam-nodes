import { defineNode } from '@jam-nodes/core'
import { fetchWithRetry } from '../../utils/http.js'
import { LEMLIST_API_BASE, buildLemlistHeaders } from './utils.js'
import {
  LemlistAddLeadInputSchema,
  LemlistAddLeadOutputSchema,
  LemlistLeadSchema,
  type LemlistAddLeadInput,
  type LemlistLead,
} from './schemas.js'

export const lemlistAddLeadNode = defineNode({
  type: 'lemlist_add_lead',
  name: 'Lemlist Add Lead',
  description: 'Add a new lead to a Lemlist campaign',
  category: 'integration',
  inputSchema: LemlistAddLeadInputSchema,
  outputSchema: LemlistAddLeadOutputSchema,
  estimatedDuration: 3,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input: LemlistAddLeadInput, context) => {
    try {
      const apiKey = context.credentials?.lemlist?.apiKey
      if (!apiKey) {
        return {
          success: false,
          error:
            'Lemlist API key not configured. Please provide context.credentials.lemlist.apiKey.',
        }
      }

      const body: Record<string, unknown> = { email: input.email }
      if (input.firstName !== undefined) body['firstName'] = input.firstName
      if (input.lastName !== undefined) body['lastName'] = input.lastName
      if (input.companyName !== undefined)
        body['companyName'] = input.companyName
      if (input.jobTitle !== undefined) body['jobTitle'] = input.jobTitle
      if (input.linkedinUrl !== undefined)
        body['linkedinUrl'] = input.linkedinUrl
      if (input.phone !== undefined) body['phone'] = input.phone
      if (input.companyDomain !== undefined)
        body['companyDomain'] = input.companyDomain
      if (input.icebreaker !== undefined) body['icebreaker'] = input.icebreaker
      if (input.timezone !== undefined) body['timezone'] = input.timezone
      if (input.contactOwner !== undefined)
        body['contactOwner'] = input.contactOwner
      if (input.picture !== undefined) body['picture'] = input.picture

      const response = await fetchWithRetry(
        `${LEMLIST_API_BASE}/campaigns/${encodeURIComponent(input.campaignId)}/leads/`,
        {
          method: 'POST',
          headers: buildLemlistHeaders(apiKey),
          body: JSON.stringify(body),
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
