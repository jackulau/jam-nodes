import { z } from 'zod'

// ─── Shared schemas ──────────────────────────────────────────────────────────

/**
 * Normalized shape for a Lemlist lead, used as the output of add/pause/resume/mark-as-interested.
 * Fields are `.nullable().optional()` because the Lemlist API omits empty fields and
 * adds new fields over time — we model the documented ones and stay permissive.
 */
export const LemlistLeadSchema = z.object({
  _id: z.string(),
  email: z.string(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  companyDomain: z.string().nullable().optional(),
  preferredContactMethod: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  isPaused: z.boolean().nullable().optional(),
  campaignId: z.string().nullable().optional(),
  campaignName: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  emailStatus: z.string().nullable().optional(),
})

/**
 * Normalized shape for a Lemlist campaign from GET /campaigns.
 */
export const LemlistCampaignSchema = z.object({
  _id: z.string(),
  name: z.string(),
  status: z.string().nullable().optional(),
  labels: z.array(z.string()).nullable().optional(),
  createdAt: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  sequenceId: z.string().nullable().optional(),
  scheduleIds: z.array(z.string()).nullable().optional(),
  teamId: z.string().nullable().optional(),
  hasError: z.boolean().nullable().optional(),
  errors: z.array(z.string()).nullable().optional(),
})

/**
 * Normalized shape for a Lemlist activity from GET /activities.
 */
export const LemlistActivitySchema = z.object({
  _id: z.string(),
  type: z.string(),
  leadId: z.string().nullable().optional(),
  campaignId: z.string().nullable().optional(),
  sequenceId: z.string().nullable().optional(),
  sequenceStep: z.number().nullable().optional(),
  createdAt: z.string().nullable().optional(),
})

export type LemlistLead = z.infer<typeof LemlistLeadSchema>
export type LemlistCampaign = z.infer<typeof LemlistCampaignSchema>
export type LemlistActivity = z.infer<typeof LemlistActivitySchema>

// ─── lemlistAddLead ──────────────────────────────────────────────────────────

export const LemlistAddLeadInputSchema = z.object({
  campaignId: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  linkedinUrl: z.string().optional(),
  phone: z.string().optional(),
  companyDomain: z.string().optional(),
  icebreaker: z.string().optional(),
  timezone: z.string().optional(),
  contactOwner: z.string().optional(),
  picture: z.string().optional(),
})

export const LemlistAddLeadOutputSchema = LemlistLeadSchema

export type LemlistAddLeadInput = z.infer<typeof LemlistAddLeadInputSchema>
export type LemlistAddLeadOutput = z.infer<typeof LemlistAddLeadOutputSchema>

// ─── lemlistGetCampaigns ─────────────────────────────────────────────────────

export const LemlistGetCampaignsInputSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
  page: z.number().int().positive().optional(),
  status: z
    .enum(['running', 'paused', 'draft', 'ended', 'archived', 'errors'])
    .optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})

export const LemlistGetCampaignsOutputSchema = z.object({
  campaigns: z.array(LemlistCampaignSchema),
  count: z.number(),
})

export type LemlistGetCampaignsInput = z.infer<
  typeof LemlistGetCampaignsInputSchema
>
export type LemlistGetCampaignsOutput = z.infer<
  typeof LemlistGetCampaignsOutputSchema
>

// ─── lemlistGetActivity ──────────────────────────────────────────────────────

export const LemlistGetActivityInputSchema = z.object({
  campaignId: z.string().optional(),
  leadId: z.string().optional(),
  type: z.string().optional(),
  isFirst: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
})

export const LemlistGetActivityOutputSchema = z.object({
  activities: z.array(LemlistActivitySchema),
  count: z.number(),
})

export type LemlistGetActivityInput = z.infer<
  typeof LemlistGetActivityInputSchema
>
export type LemlistGetActivityOutput = z.infer<
  typeof LemlistGetActivityOutputSchema
>

// ─── lemlistPauseLead ────────────────────────────────────────────────────────

export const LemlistPauseLeadInputSchema = z.object({
  leadId: z.string().min(1),
  campaignId: z.string().optional(),
})

export const LemlistPauseLeadOutputSchema = z.object({
  leads: z.array(LemlistLeadSchema),
})

export type LemlistPauseLeadInput = z.infer<typeof LemlistPauseLeadInputSchema>
export type LemlistPauseLeadOutput = z.infer<
  typeof LemlistPauseLeadOutputSchema
>

// ─── lemlistResumeLead ───────────────────────────────────────────────────────

export const LemlistResumeLeadInputSchema = z.object({
  leadId: z.string().min(1),
  campaignId: z.string().optional(),
})

export const LemlistResumeLeadOutputSchema = z.object({
  leads: z.array(LemlistLeadSchema),
})

export type LemlistResumeLeadInput = z.infer<
  typeof LemlistResumeLeadInputSchema
>
export type LemlistResumeLeadOutput = z.infer<
  typeof LemlistResumeLeadOutputSchema
>

// ─── lemlistMarkAsInterested ─────────────────────────────────────────────────

export const LemlistMarkAsInterestedInputSchema = z.object({
  campaignId: z.string().min(1),
  leadIdOrEmail: z.string().min(1),
})

export const LemlistMarkAsInterestedOutputSchema = LemlistLeadSchema

export type LemlistMarkAsInterestedInput = z.infer<
  typeof LemlistMarkAsInterestedInputSchema
>
export type LemlistMarkAsInterestedOutput = z.infer<
  typeof LemlistMarkAsInterestedOutputSchema
>
