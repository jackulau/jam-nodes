import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hubspotCredential,
  hubspotCreateObjectNode,
  hubspotGetObjectNode,
  hubspotUpdateObjectNode,
  hubspotDeleteObjectNode,
  hubspotSearchObjectsNode,
  hubspotListMembershipNode,
  HubSpotCreateObjectInputSchema,
  HubSpotGetObjectInputSchema,
  HubSpotDeleteObjectInputSchema,
  HubSpotSearchObjectsInputSchema,
  HubSpotListMembershipInputSchema,
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
  credentials: { hubspot: { clientId: 'cid', clientSecret: 'cs', accessToken: 'hpt-test-token' } },
};

// ─── Credential metadata ────────────────────────────────────────────────────

describe('hubspot credentials', () => {
  it('defines oauth2 credential metadata', () => {
    expect(hubspotCredential.name).toBe('hubspot');
    expect(hubspotCredential.type).toBe('oauth2');
  });

  it('includes key scopes', () => {
    const scopes = hubspotCredential.config.scopes;
    expect(scopes).toContain('crm.objects.contacts.read');
    expect(scopes).toContain('crm.objects.contacts.write');
    expect(scopes).toContain('crm.objects.companies.read');
    expect(scopes).toContain('crm.objects.deals.read');
  });
});

// ─── Schema validation ─────────────────────────────────────────────────────

describe('hubspot schemas', () => {
  it('create requires objectType and properties', () => {
    const valid = HubSpotCreateObjectInputSchema.safeParse({
      objectType: 'contacts',
      properties: { email: 'test@example.com' },
    });
    expect(valid.success).toBe(true);

    const missingType = HubSpotCreateObjectInputSchema.safeParse({
      properties: { email: 'test@example.com' },
    });
    expect(missingType.success).toBe(false);

    const missingProps = HubSpotCreateObjectInputSchema.safeParse({
      objectType: 'contacts',
    });
    expect(missingProps.success).toBe(false);
  });

  it('get requires objectType and objectId', () => {
    const valid = HubSpotGetObjectInputSchema.safeParse({
      objectType: 'contacts',
      objectId: '123',
    });
    expect(valid.success).toBe(true);

    const missingId = HubSpotGetObjectInputSchema.safeParse({
      objectType: 'contacts',
    });
    expect(missingId.success).toBe(false);

    const missingType = HubSpotGetObjectInputSchema.safeParse({
      objectId: '123',
    });
    expect(missingType.success).toBe(false);
  });

  it('delete rejects empty objectId', () => {
    const valid = HubSpotDeleteObjectInputSchema.safeParse({
      objectType: 'contacts',
      objectId: '456',
    });
    expect(valid.success).toBe(true);

    const emptyId = HubSpotDeleteObjectInputSchema.safeParse({
      objectType: 'contacts',
      objectId: '',
    });
    expect(emptyId.success).toBe(false);
  });

  it('search accepts filterGroups, sorts, properties, limit, after', () => {
    const result = HubSpotSearchObjectsInputSchema.safeParse({
      objectType: 'contacts',
      filterGroups: [
        {
          filters: [
            { propertyName: 'email', operator: 'EQ', value: 'test@example.com' },
          ],
        },
      ],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      properties: ['email', 'firstname'],
      limit: 20,
      after: '10',
    });
    expect(result.success).toBe(true);

    const minimal = HubSpotSearchObjectsInputSchema.safeParse({
      objectType: 'deals',
    });
    expect(minimal.success).toBe(true);
  });

  it('list membership needs action, listId, and contactIds', () => {
    const valid = HubSpotListMembershipInputSchema.safeParse({
      action: 'add',
      listId: 'list-1',
      contactIds: ['c1', 'c2'],
    });
    expect(valid.success).toBe(true);

    const missingAction = HubSpotListMembershipInputSchema.safeParse({
      listId: 'list-1',
      contactIds: ['c1'],
    });
    expect(missingAction.success).toBe(false);

    const missingListId = HubSpotListMembershipInputSchema.safeParse({
      action: 'add',
      contactIds: ['c1'],
    });
    expect(missingListId.success).toBe(false);

    const missingContactIds = HubSpotListMembershipInputSchema.safeParse({
      action: 'remove',
      listId: 'list-1',
    });
    expect(missingContactIds.success).toBe(false);

    const emptyContactIds = HubSpotListMembershipInputSchema.safeParse({
      action: 'add',
      listId: 'list-1',
      contactIds: [],
    });
    expect(emptyContactIds.success).toBe(false);
  });
});

// ─── hubspot_create_object ──────────────────────────────────────────────────

describe('hubspot_create_object', () => {
  it('fails when access token is missing', async () => {
    const result = await hubspotCreateObjectNode.executor(
      { objectType: 'contacts', properties: { email: 'test@example.com' } },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('hubspot.accessToken');
  });

  it('creates contact and returns id + properties', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '123',
          properties: { email: 'test@example.com' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hubspotCreateObjectNode.executor(
      { objectType: 'contacts', properties: { email: 'test@example.com' } },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.id).toBe('123');
      expect(result.output.properties).toEqual({ email: 'test@example.com' });
      expect(result.output.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(result.output.updatedAt).toBe('2024-01-01T00:00:00Z');
    }
  });

  it('sends correct Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '1',
          properties: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotCreateObjectNode.executor(
      { objectType: 'contacts', properties: { email: 'a@b.com' } },
      authedContext
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer hpt-test-token'
    );
  });

  it('sends correct body with properties', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '1',
          properties: { email: 'a@b.com', firstname: 'Alice' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotCreateObjectNode.executor(
      { objectType: 'contacts', properties: { email: 'a@b.com', firstname: 'Alice' } },
      authedContext
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body).toEqual({ properties: { email: 'a@b.com', firstname: 'Alice' } });
  });

  it('returns error on API 400 failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ message: 'Property values were not valid' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hubspotCreateObjectNode.executor(
      { objectType: 'contacts', properties: { email: 'bad' } },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('400');
  });
});

// ─── hubspot_create_object with companies ───────────────────────────────────

describe('hubspot_create_object with companies', () => {
  it('sends POST to /companies URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'company-1',
          properties: { name: 'Acme Inc', domain: 'acme.com' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hubspotCreateObjectNode.executor(
      { objectType: 'companies', properties: { name: 'Acme Inc', domain: 'acme.com' } },
      authedContext
    );

    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/companies');
  });
});

// ─── hubspot_update_object ──────────────────────────────────────────────────

describe('hubspot_update_object', () => {
  it('fails when access token is missing', async () => {
    const result = await hubspotUpdateObjectNode.executor(
      { objectType: 'contacts', objectId: '123', properties: { firstname: 'Updated' } },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('hubspot.accessToken');
  });

  it('sends PATCH to correct URL with objectId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'contact-456',
          properties: { firstname: 'Updated' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotUpdateObjectNode.executor(
      { objectType: 'contacts', objectId: 'contact-456', properties: { firstname: 'Updated' } },
      authedContext
    );

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v3/objects/contacts/contact-456');
    expect(requestInit.method).toBe('PATCH');
  });
});

// ─── hubspot_get_object ─────────────────────────────────────────────────────

describe('hubspot_get_object', () => {
  it('fails when access token is missing', async () => {
    const result = await hubspotGetObjectNode.executor(
      { objectType: 'contacts', objectId: '123' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('hubspot.accessToken');
  });

  it('sends GET with properties query param (comma-joined)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '123',
          properties: { email: 'a@b.com', firstname: 'Alice' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotGetObjectNode.executor(
      { objectType: 'contacts', objectId: '123', properties: ['email', 'firstname'] },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('?properties=email,firstname');
  });

  it('sends GET without properties (no query string)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '123',
          properties: { email: 'a@b.com' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotGetObjectNode.executor(
      { objectType: 'contacts', objectId: '123' },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('?');
  });
});

// ─── hubspot_search_objects ─────────────────────────────────────────────────

describe('hubspot_search_objects', () => {
  it('fails when access token is missing', async () => {
    const result = await hubspotSearchObjectsNode.executor(
      { objectType: 'contacts', limit: 10 },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('hubspot.accessToken');
  });

  it('sends POST with filterGroups, sorts, and limit in body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 1,
          results: [
            {
              id: '100',
              properties: { email: 'found@example.com' },
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotSearchObjectsNode.executor(
      {
        objectType: 'contacts',
        filterGroups: [
          { filters: [{ propertyName: 'email', operator: 'EQ', value: 'found@example.com' }] },
        ],
        sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
        limit: 5,
      },
      authedContext
    );

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v3/objects/contacts/search');
    const body = JSON.parse(String(requestInit.body));
    expect(body.filterGroups).toHaveLength(1);
    expect(body.filterGroups[0].filters[0].propertyName).toBe('email');
    expect(body.sorts).toHaveLength(1);
    expect(body.sorts[0].direction).toBe('DESCENDING');
    expect(body.limit).toBe(5);
  });

  it('search with sort for "get recent" pattern (lastmodifieddate DESCENDING)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 2,
          results: [
            {
              id: '1',
              properties: { email: 'recent@example.com' },
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-02T00:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotSearchObjectsNode.executor(
      {
        objectType: 'contacts',
        sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
        limit: 5,
      },
      authedContext
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.sorts).toEqual([
      { propertyName: 'lastmodifieddate', direction: 'DESCENDING' },
    ]);
  });
});

// ─── hubspot_search_objects by domain ───────────────────────────────────────

describe('hubspot_search_objects by domain', () => {
  it('sends filterGroups with domain EQ filter for companies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 1,
          results: [
            {
              id: 'company-2',
              properties: { name: 'Acme', domain: 'acme.com' },
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotSearchObjectsNode.executor(
      {
        objectType: 'companies',
        filterGroups: [
          {
            filters: [
              { propertyName: 'domain', operator: 'EQ', value: 'acme.com' },
            ],
          },
        ],
      },
      authedContext
    );

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v3/objects/companies/search');
    const body = JSON.parse(String(requestInit.body));
    expect(body.filterGroups).toEqual([
      {
        filters: [
          { propertyName: 'domain', operator: 'EQ', value: 'acme.com' },
        ],
      },
    ]);
  });
});

// ─── hubspot_delete_object ──────────────────────────────────────────────────

describe('hubspot_delete_object', () => {
  it('fails when access token is missing', async () => {
    const result = await hubspotDeleteObjectNode.executor(
      { objectType: 'contacts', objectId: 'contact-123' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('hubspot.accessToken');
  });

  it('handles 204 No Content and returns deleted confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hubspotDeleteObjectNode.executor(
      { objectType: 'contacts', objectId: 'contact-123' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toEqual({ id: 'contact-123', deleted: true });
    }
  });

  it('sends DELETE to correct URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotDeleteObjectNode.executor(
      { objectType: 'deals', objectId: 'deal-789' },
      authedContext
    );

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v3/objects/deals/deal-789');
    expect(requestInit.method).toBe('DELETE');
  });
});

// ─── hubspot_list_membership add ────────────────────────────────────────────

describe('hubspot_list_membership add', () => {
  it('fails when access token is missing', async () => {
    const result = await hubspotListMembershipNode.executor(
      { action: 'add', listId: 'list-1', contactIds: ['c1'] },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('hubspot.accessToken');
  });

  it('sends recordIdsToAdd in body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ recordIdsAdded: ['c1', 'c2'], recordIdsMissing: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hubspotListMembershipNode.executor(
      { action: 'add', listId: 'list-1', contactIds: ['c1', 'c2'] },
      authedContext
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body).toEqual({ recordIdsToAdd: ['c1', 'c2'] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.recordIdsProcessed).toEqual(['c1', 'c2']);
      expect(result.output.recordIdsMissing).toEqual([]);
    }
  });

  it('sends PUT to correct URL with listId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ recordIdsAdded: ['c1'], recordIdsMissing: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotListMembershipNode.executor(
      { action: 'add', listId: 'list-42', contactIds: ['c1'] },
      authedContext
    );

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v3/lists/list-42/memberships/add');
    expect(requestInit.method).toBe('PUT');
  });
});

// ─── hubspot_list_membership remove ─────────────────────────────────────────

describe('hubspot_list_membership remove', () => {
  it('sends recordIdsToRemove in body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ recordIdsRemoved: ['c3'], recordIdsMissing: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hubspotListMembershipNode.executor(
      { action: 'remove', listId: 'list-1', contactIds: ['c3'] },
      authedContext
    );

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v3/lists/list-1/memberships/remove');
    const body = JSON.parse(String(requestInit.body));
    expect(body).toEqual({ recordIdsToRemove: ['c3'] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.recordIdsProcessed).toEqual(['c3']);
    }
  });

  it('returns error on API failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ message: 'List not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hubspotListMembershipNode.executor(
      { action: 'remove', listId: 'nonexistent', contactIds: ['c1'] },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });
});

// ─── Full CRUD flow ─────────────────────────────────────────────────────────

describe('hubspot full CRUD flow', () => {
  it('create -> get -> update -> delete', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      callCount++;
      if (init.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'contact-new',
            properties: { email: 'new@example.com' },
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init.method === 'GET') {
        return new Response(
          JSON.stringify({
            id: 'contact-new',
            properties: { email: 'new@example.com' },
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            id: 'contact-new',
            properties: { email: 'updated@example.com' },
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected method: ${init.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // Create
    const createResult = await hubspotCreateObjectNode.executor(
      { objectType: 'contacts', properties: { email: 'new@example.com' } },
      authedContext
    );
    expect(createResult.success).toBe(true);

    // Get
    const getResult = await hubspotGetObjectNode.executor(
      { objectType: 'contacts', objectId: 'contact-new' },
      authedContext
    );
    expect(getResult.success).toBe(true);

    // Update
    const updateResult = await hubspotUpdateObjectNode.executor(
      { objectType: 'contacts', objectId: 'contact-new', properties: { email: 'updated@example.com' } },
      authedContext
    );
    expect(updateResult.success).toBe(true);

    // Delete
    const deleteResult = await hubspotDeleteObjectNode.executor(
      { objectType: 'contacts', objectId: 'contact-new' },
      authedContext
    );
    expect(deleteResult.success).toBe(true);

    expect(callCount).toBe(4);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('hubspot edge cases', () => {
  it('delete 204 No Content is handled without json call', async () => {
    const jsonSpy = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: jsonSpy,
      text: vi.fn().mockResolvedValue(''),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await hubspotDeleteObjectNode.executor(
      { objectType: 'contacts', objectId: 'del-1' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toEqual({ id: 'del-1', deleted: true });
    }
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('API returns HTML error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html>error</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hubspotCreateObjectNode.executor(
      { objectType: 'contacts', properties: { email: 'test@example.com' } },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('get object with empty properties array has no query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '123',
          properties: { email: 'a@b.com' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await hubspotGetObjectNode.executor(
      { objectType: 'contacts', objectId: '123', properties: [] },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('?');
  });

  it('network error returns success false', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network failure'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await hubspotCreateObjectNode.executor(
      { objectType: 'contacts', properties: { email: 'test@example.com' } },
      authedContext
    );

    expect(result.success).toBe(false);
  });
});
