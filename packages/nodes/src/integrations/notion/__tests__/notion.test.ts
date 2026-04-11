import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  notionCredential,
  notionCreatePageNode,
  notionUpdatePageNode,
  notionQueryDatabaseNode,
  notionAppendBlocksNode,
  NotionCreatePageInputSchema,
  NotionUpdatePageInputSchema,
  NotionQueryDatabaseInputSchema,
  NotionAppendBlocksInputSchema,
  NotionSortSchema,
  NotionBlockSchema,
  buildNotionHeaders,
} from '../index.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const makeContext = (credentials?: Record<string, unknown>) => ({
  userId: 'u1',
  workflowExecutionId: 'w1',
  variables: {},
  resolveNestedPath: () => undefined,
  credentials,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const notionPageBody = (overrides: Record<string, unknown> = {}) => ({
  id: 'page_123',
  url: 'https://notion.so/page_123',
  created_time: '2026-04-11T10:00:00.000Z',
  last_edited_time: '2026-04-11T10:00:00.000Z',
  archived: false,
  properties: { Name: { title: [{ text: { content: 'Test' } }] } },
  ...overrides,
});

// =============================================================================
// Credential
// =============================================================================

describe('notion credentials', () => {
  it('defines bearer credential metadata', () => {
    expect(notionCredential.name).toBe('notion');
    expect(notionCredential.type).toBe('bearer');
    expect(notionCredential.authenticate.properties.Authorization).toBe(
      'Bearer {{apiToken}}'
    );
  });

  it('schema requires apiToken', () => {
    const result = notionCredential.schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('schema rejects empty apiToken', () => {
    const result = notionCredential.schema.safeParse({ apiToken: '' });
    expect(result.success).toBe(false);
  });

  it('schema accepts non-empty apiToken', () => {
    const result = notionCredential.schema.safeParse({ apiToken: 'secret_abc' });
    expect(result.success).toBe(true);
  });

  it('schema rejects apiToken with embedded newline (CRLF header-injection defense)', () => {
    const result = notionCredential.schema.safeParse({
      apiToken: 'secret_abc\nX-Injected: evil',
    });
    expect(result.success).toBe(false);
  });

  it('schema rejects apiToken with embedded carriage return', () => {
    const result = notionCredential.schema.safeParse({
      apiToken: 'secret_abc\rinject',
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Shared schemas
// =============================================================================

describe('notion shared schemas', () => {
  it('NotionBlockSchema is permissive', () => {
    const result = NotionBlockSchema.safeParse({
      type: 'paragraph',
      paragraph: { rich_text: [] },
    });
    expect(result.success).toBe(true);
  });

  it('NotionSortSchema rejects missing direction', () => {
    const result = NotionSortSchema.safeParse({ property: 'Name' });
    expect(result.success).toBe(false);
  });

  it('NotionSortSchema rejects missing property/timestamp', () => {
    const result = NotionSortSchema.safeParse({ direction: 'ascending' });
    expect(result.success).toBe(false);
  });

  it('NotionSortSchema accepts property + direction', () => {
    const result = NotionSortSchema.safeParse({
      property: 'Name',
      direction: 'ascending',
    });
    expect(result.success).toBe(true);
  });

  it('NotionSortSchema accepts timestamp + direction', () => {
    const result = NotionSortSchema.safeParse({
      timestamp: 'created_time',
      direction: 'descending',
    });
    expect(result.success).toBe(true);
  });

  it('buildNotionHeaders returns Authorization and Notion-Version headers', () => {
    const headers = buildNotionHeaders('secret_abc');
    expect(headers.Authorization).toBe('Bearer secret_abc');
    expect(headers['Notion-Version']).toBe('2022-06-28');
    expect(headers['Content-Type']).toBe('application/json');
  });
});

// =============================================================================
// notion_create_page
// =============================================================================

describe('NotionCreatePageInputSchema', () => {
  it('validates a minimal payload', () => {
    const result = NotionCreatePageInputSchema.safeParse({
      parentDatabaseId: 'db_123',
      properties: { Name: { title: [{ text: { content: 'X' } }] } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty parentDatabaseId', () => {
    const result = NotionCreatePageInputSchema.safeParse({
      parentDatabaseId: '',
      properties: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('notion_create_page', () => {
  it('fails when API token is missing', async () => {
    const result = await notionCreatePageNode.executor(
      { parentDatabaseId: 'db_123', properties: {} },
      makeContext()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('notion.apiToken');
  });

  it('creates page and returns id + url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, notionPageBody()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await notionCreatePageNode.executor(
      {
        parentDatabaseId: 'db_123',
        properties: { Name: { title: [{ text: { content: 'Test Page' } }] } },
      },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.id).toBe('page_123');
      expect(result.output.url).toBe('https://notion.so/page_123');
      expect(result.output.createdTime).toBe('2026-04-11T10:00:00.000Z');
      expect(result.output.archived).toBe(false);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.notion.com/v1/pages');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret_abc');
    expect(headers['Notion-Version']).toBe('2022-06-28');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.parent).toEqual({ database_id: 'db_123' });
    expect(body.properties).toEqual({
      Name: { title: [{ text: { content: 'Test Page' } }] },
    });
  });

  it('forwards icon and cover into request body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, notionPageBody()));
    vi.stubGlobal('fetch', fetchMock);

    await notionCreatePageNode.executor(
      {
        parentDatabaseId: 'db_123',
        properties: {},
        icon: { type: 'emoji', emoji: '📄' },
        cover: {
          type: 'external',
          external: { url: 'https://example.com/cover.png' },
        },
      },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.icon).toEqual({ type: 'emoji', emoji: '📄' });
    expect(body.cover).toEqual({
      type: 'external',
      external: { url: 'https://example.com/cover.png' },
    });
  });

  it('forwards children blocks', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, notionPageBody()));
    vi.stubGlobal('fetch', fetchMock);

    await notionCreatePageNode.executor(
      {
        parentDatabaseId: 'db_123',
        properties: {},
        children: [
          { type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'hi' } }] } },
        ],
      },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.children).toHaveLength(1);
    expect(body.children[0].type).toBe('paragraph');
  });

  it('propagates Notion validation_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          code: 'validation_error',
          message: 'Bad property',
        })
      )
    );

    const result = await notionCreatePageNode.executor(
      { parentDatabaseId: 'db_123', properties: {} },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('validation_error');
    expect(result.error).toContain('Bad property');
  });

  it('surfaces 401 unauthorized distinct from missing creds', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(401, { code: 'unauthorized', message: 'API token is invalid.' })
        )
    );

    const result = await notionCreatePageNode.executor(
      { parentDatabaseId: 'db_123', properties: {} },
      makeContext({ notion: { apiToken: 'bad_token' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
    expect(result.error).toContain('unauthorized');
  });

  it('surfaces 403 restricted_resource distinct from 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(403, {
            code: 'restricted_resource',
            message: 'Integration not shared with parent.',
          })
        )
    );

    const result = await notionCreatePageNode.executor(
      { parentDatabaseId: 'db_123', properties: {} },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
    expect(result.error).toContain('restricted_resource');
  });

  it('accepts explicit empty properties object', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, notionPageBody()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await notionCreatePageNode.executor(
      { parentDatabaseId: 'db_123', properties: {} },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.properties).toEqual({});
  });
});

// =============================================================================
// notion_update_page
// =============================================================================

describe('NotionUpdatePageInputSchema', () => {
  it('rejects no-op update (pageId only)', () => {
    const result = NotionUpdatePageInputSchema.safeParse({ pageId: 'p1' });
    expect(result.success).toBe(false);
  });

  it('accepts archived-only update', () => {
    const result = NotionUpdatePageInputSchema.safeParse({
      pageId: 'p1',
      archived: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts present-but-empty properties', () => {
    const result = NotionUpdatePageInputSchema.safeParse({
      pageId: 'p1',
      properties: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty pageId', () => {
    const result = NotionUpdatePageInputSchema.safeParse({
      pageId: '',
      archived: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('notion_update_page', () => {
  it('fails when API token is missing', async () => {
    const result = await notionUpdatePageNode.executor(
      { pageId: 'p1', archived: true },
      makeContext()
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('notion.apiToken');
  });

  it('updates page properties', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, notionPageBody({ id: 'p1' })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await notionUpdatePageNode.executor(
      {
        pageId: 'p1',
        properties: { Name: { title: [{ text: { content: 'Renamed' } }] } },
      },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.notion.com/v1/pages/p1');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.properties).toBeDefined();
    expect(body.archived).toBeUndefined();
    expect(body.icon).toBeUndefined();
  });

  it('forwards icon and cover into update body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, notionPageBody()));
    vi.stubGlobal('fetch', fetchMock);

    await notionUpdatePageNode.executor(
      {
        pageId: 'p1',
        icon: { type: 'emoji', emoji: '✅' },
        cover: {
          type: 'external',
          external: { url: 'https://example.com/new-cover.png' },
        },
      },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.icon).toEqual({ type: 'emoji', emoji: '✅' });
    expect(body.cover).toEqual({
      type: 'external',
      external: { url: 'https://example.com/new-cover.png' },
    });
    expect(body.properties).toBeUndefined();
    expect(body.archived).toBeUndefined();
  });

  it('archives page without sending properties key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, notionPageBody({ archived: true })));
    vi.stubGlobal('fetch', fetchMock);

    await notionUpdatePageNode.executor(
      { pageId: 'p1', archived: true },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ archived: true });
  });

  it('preserves explicit empty properties in body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, notionPageBody()));
    vi.stubGlobal('fetch', fetchMock);

    await notionUpdatePageNode.executor(
      { pageId: 'p1', properties: {} },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.properties).toEqual({});
  });

  it('encodes url-unsafe pageId', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, notionPageBody({ id: 'abc def' })));
    vi.stubGlobal('fetch', fetchMock);

    await notionUpdatePageNode.executor(
      { pageId: 'abc def/../evil', archived: true },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.notion.com/v1/pages/${encodeURIComponent('abc def/../evil')}`
    );
    expect(url).not.toContain(' ');
    expect(url).not.toContain('/../');
  });

  it('propagates 404 object_not_found', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(404, { code: 'object_not_found', message: 'Could not find page.' })
        )
    );

    const result = await notionUpdatePageNode.executor(
      { pageId: 'p_missing', archived: true },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('object_not_found');
  });

  it('propagates 409 conflict_error on archived page', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(409, { code: 'conflict_error', message: 'Page is archived.' })
        )
    );

    const result = await notionUpdatePageNode.executor(
      {
        pageId: 'p1',
        properties: { Name: { title: [{ text: { content: 'x' } }] } },
      },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('conflict_error');
  });
});

// =============================================================================
// notion_query_database
// =============================================================================

describe('NotionQueryDatabaseInputSchema', () => {
  it('applies default pageSize of 100', () => {
    const result = NotionQueryDatabaseInputSchema.safeParse({ databaseId: 'db1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageSize).toBe(100);
    }
  });

  it('rejects pageSize 0', () => {
    const result = NotionQueryDatabaseInputSchema.safeParse({
      databaseId: 'db1',
      pageSize: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects pageSize > 100', () => {
    const result = NotionQueryDatabaseInputSchema.safeParse({
      databaseId: 'db1',
      pageSize: 101,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty databaseId', () => {
    const result = NotionQueryDatabaseInputSchema.safeParse({ databaseId: '' });
    expect(result.success).toBe(false);
  });
});

describe('notion_query_database', () => {
  it('fails when API token is missing', async () => {
    const result = await notionQueryDatabaseNode.executor(
      { databaseId: 'db1', pageSize: 100 },
      makeContext()
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('notion.apiToken');
  });

  it('queries database and returns mapped results', async () => {
    const notionPage = (id: string) => ({
      id,
      url: `https://notion.so/${id}`,
      created_time: '2026-04-11T10:00:00.000Z',
      last_edited_time: '2026-04-11T10:00:00.000Z',
      archived: false,
      properties: {},
    });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        results: [notionPage('p1'), notionPage('p2')],
        has_more: true,
        next_cursor: 'cursor_1',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await notionQueryDatabaseNode.executor(
      { databaseId: 'db1', pageSize: 100 },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.results).toHaveLength(2);
      expect(result.output.hasMore).toBe(true);
      expect(result.output.nextCursor).toBe('cursor_1');
    }

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.notion.com/v1/databases/db1/query');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Notion-Version']).toBe('2022-06-28');
  });

  it('forwards filter, sorts, and uses snake_case page_size', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        results: [],
        has_more: false,
        next_cursor: null,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await notionQueryDatabaseNode.executor(
      {
        databaseId: 'db1',
        filter: { property: 'Name', title: { contains: 'x' } },
        sorts: [{ property: 'Name', direction: 'ascending' }],
        pageSize: 50,
        startCursor: 'cursor_0',
      },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.filter).toEqual({ property: 'Name', title: { contains: 'x' } });
    expect(body.sorts).toEqual([{ property: 'Name', direction: 'ascending' }]);
    expect(body.page_size).toBe(50);
    expect(body.start_cursor).toBe('cursor_0');
  });

  it('handles empty results + null next_cursor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { results: [], has_more: false, next_cursor: null })
      )
    );

    const result = await notionQueryDatabaseNode.executor(
      { databaseId: 'db1', pageSize: 100 },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.results).toHaveLength(0);
      expect(result.output.hasMore).toBe(false);
      expect(result.output.nextCursor).toBeNull();
    }
  });

  it('handles cursor boundary (empty results with has_more: true)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { results: [], has_more: true, next_cursor: 'cursor_2' })
      )
    );

    const result = await notionQueryDatabaseNode.executor(
      { databaseId: 'db1', pageSize: 100 },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.hasMore).toBe(true);
      expect(result.output.nextCursor).toBe('cursor_2');
    }
  });

  it('omits start_cursor key when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { results: [], has_more: false, next_cursor: null })
    );
    vi.stubGlobal('fetch', fetchMock);

    await notionQueryDatabaseNode.executor(
      { databaseId: 'db1', pageSize: 100 },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect('start_cursor' in body).toBe(false);
  });

  it('accepts passthrough fields on returned page objects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          results: [
            {
              id: 'p1',
              url: 'https://notion.so/p1',
              created_time: '2026-04-11T10:00:00.000Z',
              last_edited_time: '2026-04-11T10:00:00.000Z',
              archived: false,
              properties: {},
              icon: { type: 'emoji', emoji: '⭐' },
            },
          ],
          has_more: false,
          next_cursor: null,
        })
      )
    );

    const result = await notionQueryDatabaseNode.executor(
      { databaseId: 'db1', pageSize: 100 },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(true);
  });

  it('propagates 400 validation_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(400, { code: 'validation_error', message: 'Invalid filter.' })
        )
    );

    const result = await notionQueryDatabaseNode.executor(
      { databaseId: 'db1', pageSize: 100 },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('validation_error');
  });
});

// =============================================================================
// notion_append_blocks
// =============================================================================

describe('NotionAppendBlocksInputSchema', () => {
  it('rejects empty children array', () => {
    const result = NotionAppendBlocksInputSchema.safeParse({
      blockId: 'b1',
      children: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts single block', () => {
    const result = NotionAppendBlocksInputSchema.safeParse({
      blockId: 'b1',
      children: [{ type: 'paragraph' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts exactly 100 children (boundary)', () => {
    const result = NotionAppendBlocksInputSchema.safeParse({
      blockId: 'b1',
      children: Array.from({ length: 100 }, () => ({ type: 'paragraph' })),
    });
    expect(result.success).toBe(true);
  });

  it('rejects 101 children (boundary over cap)', () => {
    const result = NotionAppendBlocksInputSchema.safeParse({
      blockId: 'b1',
      children: Array.from({ length: 101 }, () => ({ type: 'paragraph' })),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty blockId', () => {
    const result = NotionAppendBlocksInputSchema.safeParse({
      blockId: '',
      children: [{ type: 'paragraph' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('notion_append_blocks', () => {
  it('fails when API token is missing', async () => {
    const result = await notionAppendBlocksNode.executor(
      { blockId: 'b1', children: [{ type: 'paragraph' }] },
      makeContext()
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('notion.apiToken');
  });

  it('appends blocks and returns appendedBlockIds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        results: [{ id: 'b_new1' }, { id: 'b_new2' }],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await notionAppendBlocksNode.executor(
      {
        blockId: 'page_abc',
        children: [
          { type: 'paragraph', paragraph: { rich_text: [] } },
          { type: 'heading_1', heading_1: { rich_text: [] } },
        ],
      },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.appendedBlockIds).toEqual(['b_new1', 'b_new2']);
    }

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.notion.com/v1/blocks/page_abc/children');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.children).toHaveLength(2);
    expect('after' in body).toBe(false);
  });

  it('forwards after cursor when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { results: [{ id: 'b_new' }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    await notionAppendBlocksNode.executor(
      {
        blockId: 'b1',
        children: [{ type: 'paragraph' }],
        after: 'b0',
      },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.after).toBe('b0');
  });

  it('encodes blockId in URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { results: [] })
    );
    vi.stubGlobal('fetch', fetchMock);

    await notionAppendBlocksNode.executor(
      { blockId: 'abc def', children: [{ type: 'paragraph' }] },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.notion.com/v1/blocks/abc%20def/children');
  });

  it('returns empty appendedBlockIds on empty results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { results: [] }))
    );

    const result = await notionAppendBlocksNode.executor(
      { blockId: 'b1', children: [{ type: 'paragraph' }] },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.appendedBlockIds).toEqual([]);
    }
  });

  it('propagates 429 rate limit error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(429, { code: 'rate_limited', message: 'Rate limited.' })
        )
    );

    const result = await notionAppendBlocksNode.executor(
      { blockId: 'b1', children: [{ type: 'paragraph' }] },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('rate_limited');
  });
});

// =============================================================================
// Integration barrel
// =============================================================================

describe('notion integration barrel', () => {
  it('exports all four nodes with expected type ids', () => {
    expect(notionCreatePageNode.type).toBe('notion_create_page');
    expect(notionUpdatePageNode.type).toBe('notion_update_page');
    expect(notionQueryDatabaseNode.type).toBe('notion_query_database');
    expect(notionAppendBlocksNode.type).toBe('notion_append_blocks');
  });

  it('every node uses category "integration"', () => {
    expect(notionCreatePageNode.category).toBe('integration');
    expect(notionUpdatePageNode.category).toBe('integration');
    expect(notionQueryDatabaseNode.category).toBe('integration');
    expect(notionAppendBlocksNode.category).toBe('integration');
  });

  it('every node sends the Notion-Version header on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, notionPageBody()));
    vi.stubGlobal('fetch', fetchMock);

    await notionCreatePageNode.executor(
      { parentDatabaseId: 'db', properties: {} },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );
    await notionUpdatePageNode.executor(
      { pageId: 'p', archived: true },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { results: [], has_more: false, next_cursor: null })
    );
    await notionQueryDatabaseNode.executor(
      { databaseId: 'db', pageSize: 100 },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { results: [] }));
    await notionAppendBlocksNode.executor(
      { blockId: 'b', children: [{ type: 'paragraph' }] },
      makeContext({ notion: { apiToken: 'secret_abc' } })
    );

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Notion-Version']).toBe('2022-06-28');
      expect(headers.Authorization).toBe('Bearer secret_abc');
    }
  });
});
