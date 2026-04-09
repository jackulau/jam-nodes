import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  airtableCredential,
  airtableCreateRecordNode,
  airtableGetRecordsNode,
  airtableUpdateRecordNode,
  airtableDeleteRecordNode,
  AirtableCreateRecordInputSchema,
  AirtableGetRecordsInputSchema,
  AirtableUpdateRecordInputSchema,
  AirtableDeleteRecordInputSchema,
} from '../index.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const baseContext = {
  userId: 'u1',
  workflowExecutionId: 'w1',
  variables: {},
  resolveNestedPath: () => undefined,
};

const authedContext = {
  ...baseContext,
  credentials: { airtable: { accessToken: 'pat-test-token' } },
};

// ─── Credential metadata ────────────────────────────────────────────────────

describe('airtable credentials', () => {
  it('defines bearer credential metadata', () => {
    expect(airtableCredential.name).toBe('airtable');
    expect(airtableCredential.type).toBe('bearer');
  });

  it('includes correct authenticate config', () => {
    expect(airtableCredential.authenticate.type).toBe('header');
    expect(airtableCredential.authenticate.properties.Authorization).toBe(
      'Bearer {{accessToken}}'
    );
  });
});

// ─── Schema validation ──────────────────────────────────────────────────────

describe('airtable schemas', () => {
  it('validates create record input with required fields', () => {
    const result = AirtableCreateRecordInputSchema.safeParse({
      baseId: 'appXXXXXXXXXX',
      tableId: 'tblXXXXXXXXXX',
      fields: { Name: 'Test' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects create record input missing fields', () => {
    const result = AirtableCreateRecordInputSchema.safeParse({
      baseId: 'appXXX',
      tableId: 'tblXXX',
    });
    expect(result.success).toBe(false);
  });

  it('validates get records input with optional fields', () => {
    const result = AirtableGetRecordsInputSchema.safeParse({
      baseId: 'appXXX',
      tableId: 'tblXXX',
    });
    expect(result.success).toBe(true);
  });

  it('accepts get records input with filterByFormula', () => {
    const result = AirtableGetRecordsInputSchema.safeParse({
      baseId: 'appXXX',
      tableId: 'tblXXX',
      filterByFormula: '{Status} = "Active"',
    });
    expect(result.success).toBe(true);
  });

  it('validates update record input', () => {
    const result = AirtableUpdateRecordInputSchema.safeParse({
      baseId: 'appXXX',
      tableId: 'tblXXX',
      recordId: 'recXXXXXXXXXX',
      fields: { Name: 'Updated' },
    });
    expect(result.success).toBe(true);
  });

  it('validates delete record input', () => {
    const result = AirtableDeleteRecordInputSchema.safeParse({
      baseId: 'appXXX',
      tableId: 'tblXXX',
      recordId: 'recXXXXXXXXXX',
    });
    expect(result.success).toBe(true);
  });

  it('rejects delete record input missing recordId', () => {
    const result = AirtableDeleteRecordInputSchema.safeParse({
      baseId: 'appXXX',
      tableId: 'tblXXX',
    });
    expect(result.success).toBe(false);
  });
});

// ─── airtableCreateRecord ───────────────────────────────────────────────────

describe('airtable_create_record', () => {
  it('fails when access token is missing', async () => {
    const result = await airtableCreateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', fields: { Name: 'Test' } },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('airtable.accessToken');
  });

  it('creates record and returns id + fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'recABC123',
          fields: { Name: 'Test', Status: 'Active' },
          createdTime: '2024-01-01T00:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableCreateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', fields: { Name: 'Test', Status: 'Active' } },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.id).toBe('recABC123');
      expect(result.output.fields).toEqual({ Name: 'Test', Status: 'Active' });
      expect(result.output.createdTime).toBe('2024-01-01T00:00:00.000Z');
    }
  });

  it('sends correct Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'rec1', fields: {}, createdTime: '2024-01-01T00:00:00.000Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await airtableCreateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', fields: {} },
      authedContext
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer pat-test-token'
    );
  });

  it('sends correct request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'rec1', fields: { Name: 'Test' }, createdTime: '2024-01-01T00:00:00.000Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await airtableCreateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', fields: { Name: 'Test' } },
      authedContext
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.fields).toEqual({ Name: 'Test' });
  });

  it('returns error on API failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { type: 'TABLE_NOT_FOUND', message: 'Could not find table' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableCreateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblNotExist', fields: { Name: 'Test' } },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });

  it('returns error on non-ok response status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":{"type":"INVALID_REQUEST"}}', {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableCreateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', fields: { BadField: 'value' } },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('422');
  });

  it('creates record with empty fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'recEmpty1', fields: {}, createdTime: '2024-01-01T00:00:00.000Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableCreateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', fields: {} },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.id).toBe('recEmpty1');
    }
  });
});

// ─── airtableGetRecords ─────────────────────────────────────────────────────

describe('airtable_get_records', () => {
  it('fails when access token is missing', async () => {
    const result = await airtableGetRecordsNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('airtable.accessToken');
  });

  it('returns records from table', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [
            { id: 'rec1', fields: { Name: 'Alice' }, createdTime: '2024-01-01T00:00:00.000Z' },
            { id: 'rec2', fields: { Name: 'Bob' }, createdTime: '2024-01-02T00:00:00.000Z' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableGetRecordsNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.records).toHaveLength(2);
      expect(result.output.records[0]?.id).toBe('rec1');
      expect(result.output.records[1]?.fields).toEqual({ Name: 'Bob' });
    }
  });

  it('sends filterByFormula as query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ records: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await airtableGetRecordsNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', filterByFormula: '{Status} = "Active"' },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('filterByFormula')).toBe('{Status} = "Active"');
  });

  it('sends sort as query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ records: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await airtableGetRecordsNode.executor(
      {
        baseId: 'appXXX',
        tableId: 'tblXXX',
        sort: [{ field: 'Name', direction: 'asc' as const }],
      },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('sort%5B0%5D%5Bfield%5D=Name');
    expect(url).toContain('sort%5B0%5D%5Bdirection%5D=asc');
  });

  it('sends multi-sort correctly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ records: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await airtableGetRecordsNode.executor(
      {
        baseId: 'appXXX',
        tableId: 'tblXXX',
        sort: [
          { field: 'Name', direction: 'asc' as const },
          { field: 'Date', direction: 'desc' as const },
        ],
      },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('sort%5B0%5D%5Bfield%5D=Name');
    expect(url).toContain('sort%5B1%5D%5Bfield%5D=Date');
    expect(url).toContain('sort%5B1%5D%5Bdirection%5D=desc');
  });

  it('sends maxRecords as query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ records: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await airtableGetRecordsNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', maxRecords: 10 },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('maxRecords=10');
  });

  it('URL-encodes filterByFormula with special chars', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ records: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const formula = `AND({Name}="O'Brien", {Age}>30)`;
    await airtableGetRecordsNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', filterByFormula: formula },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    // The formula should be properly encoded in the query string
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('filterByFormula')).toBe(formula);
  });

  it('returns offset for pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [{ id: 'rec1', fields: {}, createdTime: '2024-01-01T00:00:00.000Z' }],
          offset: 'itr12345/rec67890',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableGetRecordsNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.offset).toBe('itr12345/rec67890');
    }
  });

  it('handles empty table', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ records: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableGetRecordsNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.records).toHaveLength(0);
    }
  });

  it('returns error on API failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":{"type":"NOT_FOUND"}}', {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableGetRecordsNode.executor(
      { baseId: 'appXXX', tableId: 'tblNotExist' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });
});

// ─── airtableUpdateRecord ───────────────────────────────────────────────────

describe('airtable_update_record', () => {
  it('fails when access token is missing', async () => {
    const result = await airtableUpdateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', recordId: 'recXXX', fields: { Name: 'Updated' } },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('airtable.accessToken');
  });

  it('updates record and returns updated fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'recABC123',
          fields: { Name: 'Updated', Status: 'Done' },
          createdTime: '2024-01-01T00:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableUpdateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', recordId: 'recABC123', fields: { Name: 'Updated' } },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.id).toBe('recABC123');
      expect(result.output.fields).toEqual({ Name: 'Updated', Status: 'Done' });
    }
  });

  it('sends PATCH to correct URL with recordId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'recABC', fields: {}, createdTime: '2024-01-01T00:00:00.000Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await airtableUpdateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblYYY', recordId: 'recABC', fields: { Name: 'Test' } },
      authedContext
    );

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('appXXX/tblYYY/recABC');
    expect(requestInit.method).toBe('PATCH');
  });

  it('sends only specified fields in body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'rec1', fields: { Name: 'New' }, createdTime: '2024-01-01T00:00:00.000Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await airtableUpdateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', recordId: 'rec1', fields: { Name: 'New' } },
      authedContext
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.fields).toEqual({ Name: 'New' });
    expect(Object.keys(body)).toEqual(['fields']);
  });

  it('returns error on API failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":{"type":"RECORD_NOT_FOUND"}}', {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableUpdateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', recordId: 'recNotExist', fields: { Name: 'X' } },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });
});

// ─── airtableDeleteRecord ───────────────────────────────────────────────────

describe('airtable_delete_record', () => {
  it('fails when access token is missing', async () => {
    const result = await airtableDeleteRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', recordId: 'recXXX' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('airtable.accessToken');
  });

  it('deletes record and returns confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'recABC123', deleted: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableDeleteRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', recordId: 'recABC123' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.id).toBe('recABC123');
      expect(result.output.deleted).toBe(true);
    }
  });

  it('sends DELETE to correct URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'recABC', deleted: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await airtableDeleteRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblYYY', recordId: 'recABC' },
      authedContext
    );

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('appXXX/tblYYY/recABC');
    expect(requestInit.method).toBe('DELETE');
  });

  it('returns error on API failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":{"type":"RECORD_NOT_FOUND"}}', {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await airtableDeleteRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', recordId: 'recNotExist' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });
});

// ─── Integration: Full CRUD flow ────────────────────────────────────────────

describe('airtable full CRUD flow', () => {
  it('create -> get -> update -> delete', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      callCount++;
      if (init.method === 'POST') {
        return new Response(
          JSON.stringify({ id: 'recNew1', fields: { Name: 'Created' }, createdTime: '2024-01-01T00:00:00.000Z' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init.method === 'GET') {
        return new Response(
          JSON.stringify({
            records: [{ id: 'recNew1', fields: { Name: 'Created' }, createdTime: '2024-01-01T00:00:00.000Z' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init.method === 'PATCH') {
        return new Response(
          JSON.stringify({ id: 'recNew1', fields: { Name: 'Updated' }, createdTime: '2024-01-01T00:00:00.000Z' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init.method === 'DELETE') {
        return new Response(
          JSON.stringify({ id: 'recNew1', deleted: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected: ${init.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // Create
    const createResult = await airtableCreateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', fields: { Name: 'Created' } },
      authedContext
    );
    expect(createResult.success).toBe(true);

    // Get
    const getResult = await airtableGetRecordsNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX' },
      authedContext
    );
    expect(getResult.success).toBe(true);

    // Update
    const updateResult = await airtableUpdateRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', recordId: 'recNew1', fields: { Name: 'Updated' } },
      authedContext
    );
    expect(updateResult.success).toBe(true);

    // Delete
    const deleteResult = await airtableDeleteRecordNode.executor(
      { baseId: 'appXXX', tableId: 'tblXXX', recordId: 'recNew1' },
      authedContext
    );
    expect(deleteResult.success).toBe(true);

    expect(callCount).toBe(4);
  });
});
