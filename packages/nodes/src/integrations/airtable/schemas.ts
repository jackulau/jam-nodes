import { z } from 'zod';

// ----- Shared sub-schemas -----

export const AirtableRecordSchema = z.object({
  id: z.string(),
  fields: z.record(z.unknown()),
  createdTime: z.string(),
});

export const AirtableSortSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']).optional().default('asc'),
});

// ----- airtableCreateRecord -----

export const AirtableCreateRecordInputSchema = z.object({
  baseId: z.string().min(1, 'Base ID is required'),
  tableId: z.string().min(1, 'Table ID is required'),
  fields: z.record(z.unknown()),
});

export const AirtableCreateRecordOutputSchema = AirtableRecordSchema;

// ----- airtableGetRecords -----

export const AirtableGetRecordsInputSchema = z.object({
  baseId: z.string().min(1, 'Base ID is required'),
  tableId: z.string().min(1, 'Table ID is required'),
  filterByFormula: z.string().optional(),
  sort: z.array(AirtableSortSchema).optional(),
  maxRecords: z.number().int().positive().optional(),
});

export const AirtableGetRecordsOutputSchema = z.object({
  records: z.array(AirtableRecordSchema),
  offset: z.string().optional(),
});

// ----- airtableUpdateRecord -----

export const AirtableUpdateRecordInputSchema = z.object({
  baseId: z.string().min(1, 'Base ID is required'),
  tableId: z.string().min(1, 'Table ID is required'),
  recordId: z.string().min(1, 'Record ID is required'),
  fields: z.record(z.unknown()),
});

export const AirtableUpdateRecordOutputSchema = AirtableRecordSchema;

// ----- airtableDeleteRecord -----

export const AirtableDeleteRecordInputSchema = z.object({
  baseId: z.string().min(1, 'Base ID is required'),
  tableId: z.string().min(1, 'Table ID is required'),
  recordId: z.string().min(1, 'Record ID is required'),
});

export const AirtableDeleteRecordOutputSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
});

// ----- Inferred types -----

export type AirtableRecord = z.infer<typeof AirtableRecordSchema>;
export type AirtableSort = z.infer<typeof AirtableSortSchema>;

export type AirtableCreateRecordInput = z.infer<typeof AirtableCreateRecordInputSchema>;
export type AirtableCreateRecordOutput = z.infer<typeof AirtableCreateRecordOutputSchema>;

export type AirtableGetRecordsInput = z.infer<typeof AirtableGetRecordsInputSchema>;
export type AirtableGetRecordsOutput = z.infer<typeof AirtableGetRecordsOutputSchema>;

export type AirtableUpdateRecordInput = z.infer<typeof AirtableUpdateRecordInputSchema>;
export type AirtableUpdateRecordOutput = z.infer<typeof AirtableUpdateRecordOutputSchema>;

export type AirtableDeleteRecordInput = z.infer<typeof AirtableDeleteRecordInputSchema>;
export type AirtableDeleteRecordOutput = z.infer<typeof AirtableDeleteRecordOutputSchema>;
