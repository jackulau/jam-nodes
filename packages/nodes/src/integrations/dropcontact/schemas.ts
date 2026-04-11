import { z } from 'zod';

export const DropcontactEnrichInputSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  company: z.string().optional(),
  website: z.string().optional(),
  linkedinUrl: z.string().optional(),
  phone: z.string().optional(),
  language: z.enum(['en', 'fr']).default('en'),
  siren: z.boolean().default(false),
  timeout: z.number().int().positive().default(120),
});

export const DropcontactEnrichOutputSchema = z.object({
  requestId: z.string(),
  success: z.boolean(),
  creditsLeft: z.number().nullable(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  civility: z.string().nullable(),
  company: z.string().nullable(),
  website: z.string().nullable(),
  linkedin: z.string().nullable(),
  phone: z.string().nullable(),
  mobilePhone: z.string().nullable(),
  siren: z.string().nullable(),
});

export type DropcontactEnrichInput = z.infer<typeof DropcontactEnrichInputSchema>;
export type DropcontactEnrichOutput = z.infer<typeof DropcontactEnrichOutputSchema>;
