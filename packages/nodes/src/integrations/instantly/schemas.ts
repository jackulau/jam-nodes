import { z } from 'zod';

// =============================================================================
// Shared: Sequence Step
// =============================================================================

export const SequenceStepSchema = z.object({
  /** Email subject line for this step */
  subject: z.string().min(1),
  /** Email body for this step (plain text or HTML) */
  body: z.string().min(1),
  /** Days to wait after the previous step before sending this one */
  delayDays: z.number().int().min(0),
});

export type SequenceStep = z.infer<typeof SequenceStepSchema>;

// =============================================================================
// Add Lead
// =============================================================================

export const InstantlyAddLeadInputSchema = z.object({
  /** The Instantly campaign ID to add the lead to */
  campaignId: z.string().min(1),
  /** The lead's email address */
  email: z.string().email(),
  /** Lead's first name */
  firstName: z.string().optional(),
  /** Lead's last name */
  lastName: z.string().optional(),
  /** Lead's company name */
  companyName: z.string().optional(),
  /** Personalization snippet inserted into the email */
  personalization: z.string().optional(),
  /** Arbitrary custom variables merged into the lead profile (max 50 keys) */
  customVariables: z
    .record(z.string(), z.unknown())
    .refine((obj) => Object.keys(obj).length <= 50, {
      message: 'customVariables may not have more than 50 keys',
    })
    .optional(),
});

export const InstantlyAddLeadOutputSchema = z.object({
  success: z.boolean(),
  leadId: z.string(),
  campaignId: z.string(),
  email: z.string(),
});

export type InstantlyAddLeadInput = z.infer<typeof InstantlyAddLeadInputSchema>;
export type InstantlyAddLeadOutput = z.infer<typeof InstantlyAddLeadOutputSchema>;

// =============================================================================
// Create Campaign
// =============================================================================

export const InstantlyCreateCampaignInputSchema = z.object({
  /** Human-readable campaign name */
  name: z.string().min(1),
  /** IDs or addresses of sending accounts attached to the campaign (max 50) */
  emailAccounts: z.array(z.string().min(1)).min(1).max(50),
  /** Ordered drip sequence — at least one step required, max 100 steps */
  sequence: z.array(SequenceStepSchema).min(1).max(100),
});

export const InstantlyCreateCampaignOutputSchema = z.object({
  success: z.boolean(),
  campaignId: z.string(),
  name: z.string(),
  emailAccountCount: z.number(),
  sequenceStepCount: z.number(),
});

export type InstantlyCreateCampaignInput = z.infer<typeof InstantlyCreateCampaignInputSchema>;
export type InstantlyCreateCampaignOutput = z.infer<typeof InstantlyCreateCampaignOutputSchema>;

// =============================================================================
// Get Analytics
// =============================================================================

export const InstantlyGetAnalyticsInputSchema = z.object({
  /** The campaign ID to fetch analytics for */
  campaignId: z.string().min(1),
});

export const InstantlyGetAnalyticsOutputSchema = z.object({
  campaignId: z.string(),
  sent: z.number(),
  opened: z.number(),
  clicked: z.number(),
  replied: z.number(),
  bounced: z.number(),
});

export type InstantlyGetAnalyticsInput = z.infer<typeof InstantlyGetAnalyticsInputSchema>;
export type InstantlyGetAnalyticsOutput = z.infer<typeof InstantlyGetAnalyticsOutputSchema>;
