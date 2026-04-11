import { z } from 'zod';
import { FetchRetryError } from '../../utils/http.js';

// =============================================================================
// Shared primitives
// =============================================================================

/**
 * Notion Rich Text / property / block objects have a deep type matrix that
 * changes across API versions. We pass them through as permissive records so
 * callers can build arbitrary Notion payloads without us re-modeling the
 * entire Notion type surface (which would be out of scope for issue #30).
 */
export const NotionRichTextSchema = z.record(z.string(), z.unknown());
export const NotionBlockSchema = z.record(z.string(), z.unknown());
export const NotionPropertiesSchema = z.record(z.string(), z.unknown());
export const NotionFilterSchema = z.record(z.string(), z.unknown());

export const NotionSortSchema = z
  .object({
    property: z.string().optional(),
    timestamp: z.enum(['created_time', 'last_edited_time']).optional(),
    direction: z.enum(['ascending', 'descending']),
  })
  .refine((data) => data.property !== undefined || data.timestamp !== undefined, {
    message: 'NotionSortSchema requires either `property` or `timestamp`',
  });

/**
 * Minimal shape of a Notion Page object as returned by the API.
 * `.passthrough()` keeps any extra fields the API adds across versions so we
 * don't have to bump the schema every time Notion adds a new field.
 */
export const NotionPageObjectSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    created_time: z.string(),
    last_edited_time: z.string(),
    archived: z.boolean(),
    properties: NotionPropertiesSchema,
  })
  .passthrough();

export type NotionRichText = z.infer<typeof NotionRichTextSchema>;
export type NotionBlock = z.infer<typeof NotionBlockSchema>;
export type NotionProperties = z.infer<typeof NotionPropertiesSchema>;
export type NotionFilter = z.infer<typeof NotionFilterSchema>;
export type NotionSort = z.infer<typeof NotionSortSchema>;
export type NotionPageObject = z.infer<typeof NotionPageObjectSchema>;

// =============================================================================
// Shared HTTP header helper
// =============================================================================

export const NOTION_API_BASE = 'https://api.notion.com/v1';
export const NOTION_API_VERSION = '2022-06-28';

export function buildNotionHeaders(apiToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_API_VERSION,
  };
}

/**
 * Format an error into the canonical Notion error string used by every
 * operation's executor. Handles two shapes of failure:
 *
 * 1. `FetchRetryError` thrown by `fetchWithRetry` (auth 401/403, rate-limit
 *    exhaustion 429, or server errors). We surface the Notion `code`/`message`
 *    from the attached body when present, so callers get the real API reason
 *    (e.g. `unauthorized`, `restricted_resource`, `rate_limited`) instead of
 *    just the generic retry-layer message.
 * 2. Any other error — return `error.message` if possible, otherwise the
 *    supplied fallback.
 */
export function formatNotionError(error: unknown, fallback: string): string {
  if (error instanceof FetchRetryError) {
    let code = 'unknown_error';
    let message = error.message;
    if (error.body) {
      try {
        const parsed = JSON.parse(error.body) as {
          code?: string;
          message?: string;
        };
        if (parsed.code) code = parsed.code;
        if (parsed.message) message = parsed.message;
      } catch {
        // body was not JSON — fall back to the FetchRetryError message
      }
    }
    const statusPart = error.status !== undefined ? `${error.status} ` : '';
    return `Notion API error ${statusPart}(${code}): ${message}`;
  }
  return error instanceof Error ? error.message : fallback;
}

// =============================================================================
// notionCreatePage
// =============================================================================

export const NotionCreatePageInputSchema = z.object({
  /** Parent database ID where the page will be created */
  parentDatabaseId: z.string().min(1, 'parentDatabaseId is required'),
  /** Page properties keyed by property name (matches the database schema) */
  properties: NotionPropertiesSchema,
  /** Optional child blocks to add as page content */
  children: z.array(NotionBlockSchema).optional(),
  /** Optional page icon (emoji or external URL) */
  icon: z.record(z.string(), z.unknown()).optional(),
  /** Optional page cover (external URL) */
  cover: z.record(z.string(), z.unknown()).optional(),
});

export const NotionCreatePageOutputSchema = z.object({
  id: z.string(),
  url: z.string(),
  createdTime: z.string(),
  lastEditedTime: z.string(),
  archived: z.boolean(),
  properties: NotionPropertiesSchema,
});

export type NotionCreatePageInput = z.infer<typeof NotionCreatePageInputSchema>;
export type NotionCreatePageOutput = z.infer<typeof NotionCreatePageOutputSchema>;

// =============================================================================
// notionUpdatePage
// =============================================================================

export const NotionUpdatePageInputSchema = z
  .object({
    pageId: z.string().min(1, 'pageId is required'),
    properties: NotionPropertiesSchema.optional(),
    archived: z.boolean().optional(),
    icon: z.record(z.string(), z.unknown()).optional(),
    cover: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) =>
      data.properties !== undefined ||
      data.archived !== undefined ||
      data.icon !== undefined ||
      data.cover !== undefined,
    {
      message:
        'notionUpdatePage requires at least one of properties, archived, icon, or cover',
    }
  );

export const NotionUpdatePageOutputSchema = z.object({
  id: z.string(),
  url: z.string(),
  createdTime: z.string(),
  lastEditedTime: z.string(),
  archived: z.boolean(),
  properties: NotionPropertiesSchema,
});

export type NotionUpdatePageInput = z.infer<typeof NotionUpdatePageInputSchema>;
export type NotionUpdatePageOutput = z.infer<typeof NotionUpdatePageOutputSchema>;

// =============================================================================
// notionQueryDatabase
// =============================================================================

export const NotionQueryDatabaseInputSchema = z.object({
  databaseId: z.string().min(1, 'databaseId is required'),
  filter: NotionFilterSchema.optional(),
  sorts: z.array(NotionSortSchema).optional(),
  startCursor: z.string().optional(),
  pageSize: z.number().int().min(1).max(100).default(100),
});

export const NotionQueryDatabaseOutputSchema = z.object({
  results: z.array(NotionPageObjectSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
});

export type NotionQueryDatabaseInput = z.infer<typeof NotionQueryDatabaseInputSchema>;
export type NotionQueryDatabaseOutput = z.infer<typeof NotionQueryDatabaseOutputSchema>;

// =============================================================================
// notionAppendBlocks
// =============================================================================

export const NotionAppendBlocksInputSchema = z.object({
  /** Block or page ID whose children we are appending to */
  blockId: z.string().min(1, 'blockId is required'),
  /** Blocks to append (Notion caps per-request at 100) */
  children: z.array(NotionBlockSchema).min(1).max(100),
  /** Optional block ID to append after */
  after: z.string().optional(),
});

export const NotionAppendBlocksOutputSchema = z.object({
  appendedBlockIds: z.array(z.string()),
});

export type NotionAppendBlocksInput = z.infer<typeof NotionAppendBlocksInputSchema>;
export type NotionAppendBlocksOutput = z.infer<typeof NotionAppendBlocksOutputSchema>;
