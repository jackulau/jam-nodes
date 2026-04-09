import { z } from 'zod';

// ----- Domain Search -----

export const HunterDomainSearchInputSchema = z.object({
  domain: z.string().min(1, 'Domain is required'),
  limit: z.number().int().min(1).max(100).optional(),
  type: z.enum(['personal', 'generic']).optional(),
  seniority: z.array(z.enum(['junior', 'senior', 'executive'])).optional(),
  department: z.array(z.enum(['sales', 'marketing', 'hr', 'it', 'finance', 'executive'])).optional(),
});

const SourceSchema = z.object({
  domain: z.string(),
  uri: z.string(),
  extractedOn: z.string(),
  lastSeenOn: z.string(),
  stillOnPage: z.boolean(),
});

const EmailResultSchema = z.object({
  value: z.string(),
  type: z.enum(['personal', 'generic']).nullable(),
  confidence: z.number(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  position: z.string().nullable(),
  department: z.string().nullable(),
  sources: z.array(SourceSchema),
});

export const HunterDomainSearchOutputSchema = z.object({
  emails: z.array(EmailResultSchema),
  meta: z.object({
    results: z.number(),
    limit: z.number(),
    offset: z.number(),
  }),
});

// ----- Email Finder -----

export const HunterEmailFinderInputSchema = z.object({
  domain: z.string().min(1, 'Domain is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});

export const HunterEmailFinderOutputSchema = z.object({
  email: z.string().nullable(),
  score: z.number(),
  position: z.string().nullable(),
  company: z.string().nullable(),
});

// ----- Email Verifier -----

export const HunterEmailVerifierInputSchema = z.object({
  email: z.string().min(1, 'Email is required'),
});

export const HunterEmailVerifierOutputSchema = z.object({
  status: z.string(),
  score: z.number(),
  regexp: z.boolean(),
  gibberish: z.boolean(),
  disposable: z.boolean(),
  webmail: z.boolean(),
  mxRecords: z.boolean(),
  smtpServer: z.boolean(),
  smtpCheck: z.boolean(),
  acceptAll: z.boolean(),
});

// ----- Inferred types -----

export type HunterDomainSearchInput = z.infer<typeof HunterDomainSearchInputSchema>;
export type HunterDomainSearchOutput = z.infer<typeof HunterDomainSearchOutputSchema>;

export type HunterEmailFinderInput = z.infer<typeof HunterEmailFinderInputSchema>;
export type HunterEmailFinderOutput = z.infer<typeof HunterEmailFinderOutputSchema>;

export type HunterEmailVerifierInput = z.infer<typeof HunterEmailVerifierInputSchema>;
export type HunterEmailVerifierOutput = z.infer<typeof HunterEmailVerifierOutputSchema>;
