import { z } from 'zod';

// ─── Shared sub-schemas ─────────────────────────────────────────────────────

export const HubSpotObjectTypeEnum = z.enum(['contacts', 'companies', 'deals']);

export const HubSpotObjectSchema = z.object({
  id: z.string(),
  properties: z.record(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const HubSpotSearchFilterSchema = z.object({
  propertyName: z.string(),
  operator: z.enum([
    'EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE',
    'BETWEEN', 'IN', 'NOT_IN', 'HAS_PROPERTY',
    'NOT_HAS_PROPERTY', 'CONTAINS_TOKEN', 'NOT_CONTAINS_TOKEN',
  ]),
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
  highValue: z.string().optional(),
});

export const HubSpotSearchFilterGroupSchema = z.object({
  filters: z.array(HubSpotSearchFilterSchema),
});

export const HubSpotSortSchema = z.object({
  propertyName: z.string(),
  direction: z.enum(['ASCENDING', 'DESCENDING']),
});

export const HubSpotPagingSchema = z.object({
  next: z.object({
    after: z.string(),
  }).optional(),
});

// ─── Create Object ──────────────────────────────────────────────────────────

export const HubSpotCreateObjectInputSchema = z.object({
  objectType: HubSpotObjectTypeEnum,
  properties: z.record(z.string()),
});

export const HubSpotCreateObjectOutputSchema = HubSpotObjectSchema;

// ─── Get Object ─────────────────────────────────────────────────────────────

export const HubSpotGetObjectInputSchema = z.object({
  objectType: HubSpotObjectTypeEnum,
  objectId: z.string().min(1, 'Object ID is required'),
  properties: z.array(z.string()).optional(),
});

export const HubSpotGetObjectOutputSchema = HubSpotObjectSchema;

// ─── Update Object ──────────────────────────────────────────────────────────

export const HubSpotUpdateObjectInputSchema = z.object({
  objectType: HubSpotObjectTypeEnum,
  objectId: z.string().min(1, 'Object ID is required'),
  properties: z.record(z.string()),
});

export const HubSpotUpdateObjectOutputSchema = HubSpotObjectSchema;

// ─── Delete Object ──────────────────────────────────────────────────────────

export const HubSpotDeleteObjectInputSchema = z.object({
  objectType: HubSpotObjectTypeEnum,
  objectId: z.string().min(1, 'Object ID is required'),
});

export const HubSpotDeleteObjectOutputSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
});

// ─── Search Objects ─────────────────────────────────────────────────────────

export const HubSpotSearchObjectsInputSchema = z.object({
  objectType: HubSpotObjectTypeEnum,
  filterGroups: z.array(HubSpotSearchFilterGroupSchema).optional(),
  sorts: z.array(HubSpotSortSchema).optional(),
  properties: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(100).optional(),
  after: z.string().optional(),
});

export const HubSpotSearchObjectsOutputSchema = z.object({
  total: z.number(),
  results: z.array(HubSpotObjectSchema),
  paging: HubSpotPagingSchema.optional(),
});

// ─── List Membership ────────────────────────────────────────────────────────

export const HubSpotListMembershipInputSchema = z.object({
  action: z.enum(['add', 'remove']),
  listId: z.string().min(1, 'List ID is required'),
  contactIds: z.array(z.string().min(1)).min(1, 'At least one contact ID is required'),
});

export const HubSpotListMembershipOutputSchema = z.object({
  recordIdsProcessed: z.array(z.string()),
  recordIdsMissing: z.array(z.string()),
});

// ─── Inferred types ─────────────────────────────────────────────────────────

export type HubSpotObjectType = z.infer<typeof HubSpotObjectTypeEnum>;
export type HubSpotObject = z.infer<typeof HubSpotObjectSchema>;
export type HubSpotSearchFilter = z.infer<typeof HubSpotSearchFilterSchema>;
export type HubSpotSearchFilterGroup = z.infer<typeof HubSpotSearchFilterGroupSchema>;
export type HubSpotSort = z.infer<typeof HubSpotSortSchema>;
export type HubSpotPaging = z.infer<typeof HubSpotPagingSchema>;

export type HubSpotCreateObjectInput = z.infer<typeof HubSpotCreateObjectInputSchema>;
export type HubSpotCreateObjectOutput = z.infer<typeof HubSpotCreateObjectOutputSchema>;
export type HubSpotGetObjectInput = z.infer<typeof HubSpotGetObjectInputSchema>;
export type HubSpotGetObjectOutput = z.infer<typeof HubSpotGetObjectOutputSchema>;
export type HubSpotUpdateObjectInput = z.infer<typeof HubSpotUpdateObjectInputSchema>;
export type HubSpotUpdateObjectOutput = z.infer<typeof HubSpotUpdateObjectOutputSchema>;
export type HubSpotDeleteObjectInput = z.infer<typeof HubSpotDeleteObjectInputSchema>;
export type HubSpotDeleteObjectOutput = z.infer<typeof HubSpotDeleteObjectOutputSchema>;
export type HubSpotSearchObjectsInput = z.infer<typeof HubSpotSearchObjectsInputSchema>;
export type HubSpotSearchObjectsOutput = z.infer<typeof HubSpotSearchObjectsOutputSchema>;
export type HubSpotListMembershipInput = z.infer<typeof HubSpotListMembershipInputSchema>;
export type HubSpotListMembershipOutput = z.infer<typeof HubSpotListMembershipOutputSchema>;
