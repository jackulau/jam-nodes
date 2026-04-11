import { z } from 'zod';

// ─── Enrich Person ────────────────────────────────────────────────────────────

export const ClearbitEnrichPersonInputSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  company: z.string().optional(),
  companyDomain: z.string().optional(),
  linkedIn: z.string().optional(),
  twitter: z.string().optional(),
});

const PersonNameSchema = z.object({
  fullName: z.string().nullable(),
  givenName: z.string().nullable(),
  familyName: z.string().nullable(),
});

const PersonEmploymentSchema = z.object({
  domain: z.string().nullable(),
  name: z.string().nullable(),
  title: z.string().nullable(),
  role: z.string().nullable(),
  seniority: z.string().nullable(),
});

const PersonSocialSchema = z.object({
  linkedin: z.object({ handle: z.string().nullable() }).nullable(),
  twitter: z
    .object({ handle: z.string().nullable(), followers: z.number().nullable() })
    .nullable(),
  facebook: z.object({ handle: z.string().nullable() }).nullable(),
  github: z.object({ handle: z.string().nullable() }).nullable(),
});

export const ClearbitEnrichPersonOutputSchema = z.object({
  id: z.string(),
  name: PersonNameSchema,
  email: z.string().nullable(),
  location: z.string().nullable(),
  employment: PersonEmploymentSchema,
  social: PersonSocialSchema,
});

// ─── Enrich Company ───────────────────────────────────────────────────────────

export const ClearbitEnrichCompanyInputSchema = z.object({
  domain: z.string().min(1, 'Domain is required'),
});

const CompanyCategorySchema = z.object({
  sector: z.string().nullable(),
  industryGroup: z.string().nullable(),
  industry: z.string().nullable(),
  subIndustry: z.string().nullable(),
});

const CompanyMetricsSchema = z.object({
  employees: z.number().nullable(),
  employeesRange: z.string().nullable(),
  raised: z.number().nullable(),
  marketCap: z.number().nullable(),
  annualRevenue: z.number().nullable(),
  alexaUsRank: z.number().nullable(),
  alexaGlobalRank: z.number().nullable(),
});

const CompanySocialSchema = z.object({
  linkedin: z.object({ handle: z.string().nullable() }).nullable(),
  twitter: z
    .object({ handle: z.string().nullable(), followers: z.number().nullable() })
    .nullable(),
  facebook: z.object({ handle: z.string().nullable() }).nullable(),
});

export const ClearbitEnrichCompanyOutputSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  domain: z.string().nullable(),
  category: CompanyCategorySchema,
  metrics: CompanyMetricsSchema,
  social: CompanySocialSchema,
});

// ─── Company Autocomplete ─────────────────────────────────────────────────────

export const ClearbitCompanyAutocompleteInputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

export const ClearbitCompanyAutocompleteOutputSchema = z.object({
  companies: z.array(
    z.object({
      name: z.string(),
      domain: z.string(),
      logo: z.string(),
    })
  ),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type ClearbitEnrichPersonInput = z.infer<typeof ClearbitEnrichPersonInputSchema>;
export type ClearbitEnrichPersonOutput = z.infer<typeof ClearbitEnrichPersonOutputSchema>;

export type ClearbitEnrichCompanyInput = z.infer<typeof ClearbitEnrichCompanyInputSchema>;
export type ClearbitEnrichCompanyOutput = z.infer<typeof ClearbitEnrichCompanyOutputSchema>;

export type ClearbitCompanyAutocompleteInput = z.infer<
  typeof ClearbitCompanyAutocompleteInputSchema
>;
export type ClearbitCompanyAutocompleteOutput = z.infer<
  typeof ClearbitCompanyAutocompleteOutputSchema
>;
