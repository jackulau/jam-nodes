import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeNode } from '@jam-nodes/core';
import {
  dropcontactCredential,
  dropcontactEnrichNode,
  DropcontactEnrichInputSchema,
  DropcontactEnrichOutputSchema,
} from '../index.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// =============================================================================
// Helpers
// =============================================================================

const makeContext = (credentials?: Record<string, unknown>) => ({
  userId: 'u1',
  workflowExecutionId: 'wf1',
  variables: {},
  resolveNestedPath: () => undefined,
  credentials,
});

const jsonResponse = (body: unknown, init: ResponseInit = { status: 200 }) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

const validInput = {
  email: 'jane@example.com',
  language: 'en' as const,
  siren: false,
  timeout: 120,
};

// =============================================================================
// Credential
// =============================================================================

describe('dropcontact credential', () => {
  it('has correct metadata', () => {
    expect(dropcontactCredential.name).toBe('dropcontact');
    expect(dropcontactCredential.type).toBe('apiKey');
    expect(dropcontactCredential.authenticate.type).toBe('header');
    expect(dropcontactCredential.authenticate.properties['X-Access-Token']).toBe('{{apiKey}}');
  });

  it('schema accepts valid apiKey', () => {
    const result = dropcontactCredential.schema.safeParse({ apiKey: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('schema rejects empty apiKey', () => {
    const result = dropcontactCredential.schema.safeParse({ apiKey: '' });
    expect(result.success).toBe(false);
  });

  it('schema rejects missing apiKey', () => {
    const result = dropcontactCredential.schema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Schemas
// =============================================================================

describe('dropcontact schemas', () => {
  it('input: accepts all fields', () => {
    const result = DropcontactEnrichInputSchema.safeParse({
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      fullName: 'Jane Doe',
      company: 'Acme',
      website: 'https://acme.com',
      linkedinUrl: 'https://linkedin.com/in/jane',
      phone: '+1-555-0100',
      language: 'fr',
      siren: true,
      timeout: 60,
    });
    expect(result.success).toBe(true);
  });

  it('input: accepts empty object and applies defaults', () => {
    const result = DropcontactEnrichInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe('en');
      expect(result.data.siren).toBe(false);
      expect(result.data.timeout).toBe(120);
    }
  });

  it('input: rejects invalid email', () => {
    const result = DropcontactEnrichInputSchema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('input: rejects empty email string', () => {
    const result = DropcontactEnrichInputSchema.safeParse({ email: '' });
    expect(result.success).toBe(false);
  });

  it('input: rejects invalid language', () => {
    const result = DropcontactEnrichInputSchema.safeParse({ language: 'de' });
    expect(result.success).toBe(false);
  });

  it('input: rejects negative timeout', () => {
    const result = DropcontactEnrichInputSchema.safeParse({ timeout: -1 });
    expect(result.success).toBe(false);
  });

  it('input: rejects zero timeout', () => {
    const result = DropcontactEnrichInputSchema.safeParse({ timeout: 0 });
    expect(result.success).toBe(false);
  });

  it('output: accepts nulls for enriched fields with non-null control fields', () => {
    const result = DropcontactEnrichOutputSchema.safeParse({
      requestId: 'req-1',
      success: true,
      creditsLeft: null,
      email: null,
      firstName: null,
      lastName: null,
      fullName: null,
      civility: null,
      company: null,
      website: null,
      linkedin: null,
      phone: null,
      mobilePhone: null,
      siren: null,
    });
    expect(result.success).toBe(true);
  });

  it('output: rejects missing requestId', () => {
    const result = DropcontactEnrichOutputSchema.safeParse({
      success: true,
      creditsLeft: null,
      email: null,
      firstName: null,
      lastName: null,
      fullName: null,
      civility: null,
      company: null,
      website: null,
      linkedin: null,
      phone: null,
      mobilePhone: null,
      siren: null,
    });
    expect(result.success).toBe(false);
  });

  it('output: rejects null requestId', () => {
    const result = DropcontactEnrichOutputSchema.safeParse({
      requestId: null,
      success: true,
      creditsLeft: null,
      email: null,
      firstName: null,
      lastName: null,
      fullName: null,
      civility: null,
      company: null,
      website: null,
      linkedin: null,
      phone: null,
      mobilePhone: null,
      siren: null,
    });
    expect(result.success).toBe(false);
  });

  it('output: rejects missing success field', () => {
    const result = DropcontactEnrichOutputSchema.safeParse({
      requestId: 'req-1',
      creditsLeft: null,
      email: null,
      firstName: null,
      lastName: null,
      fullName: null,
      civility: null,
      company: null,
      website: null,
      linkedin: null,
      phone: null,
      mobilePhone: null,
      siren: null,
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// dropcontactEnrichNode
// =============================================================================

describe('dropcontactEnrichNode', () => {
  it('has correct metadata', () => {
    expect(dropcontactEnrichNode.type).toBe('dropcontact_enrich');
    expect(dropcontactEnrichNode.category).toBe('integration');
    expect(dropcontactEnrichNode.estimatedDuration).toBe(30);
  });

  // ─── Credential handling ───────────────────────────────────────────────────

  it('returns failure when credentials object is empty', async () => {
    const result = await dropcontactEnrichNode.executor(validInput, makeContext({}));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/api key|apiKey/i);
  });

  it('returns failure when credentials.dropcontact is missing', async () => {
    const result = await dropcontactEnrichNode.executor(
      validInput,
      makeContext({ apollo: { apiKey: 'x' } })
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/dropcontact/i);
  });

  it('returns failure when credentials.dropcontact.apiKey is empty string', async () => {
    const result = await dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: '' } })
    );
    expect(result.success).toBe(false);
  });

  // ─── POST submission ───────────────────────────────────────────────────────

  it('POSTs to /batch with X-Access-Token header and JSON body', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1', credits_left: 100 }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ email: 'jane@example.com', first_name: 'Jane' }],
          credits_left: 99,
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      { ...validInput, firstName: 'Jane', company: 'Acme' },
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.dropcontact.io/batch');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Access-Token']).toBe('test-key');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as {
      data: Array<Record<string, unknown>>;
      siren: boolean;
      language: string;
    };
    expect(body.siren).toBe(false);
    expect(body.language).toBe('en');
    expect(body.data[0]?.['email']).toBe('jane@example.com');
    expect(body.data[0]?.['first_name']).toBe('Jane');
    expect(body.data[0]?.['company']).toBe('Acme');
  });

  it('POST body only contains user-supplied fields', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: [{ email: 'jane@example.com' }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      { email: 'jane@example.com', language: 'en', siren: false, timeout: 120 },
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    await promise;

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { data: Array<Record<string, unknown>> };
    const contact = body.data[0] ?? {};
    expect(contact['email']).toBe('jane@example.com');
    expect('first_name' in contact).toBe(false);
    expect('last_name' in contact).toBe(false);
    expect('company' in contact).toBe(false);
    expect('phone' in contact).toBe(false);
  });

  // ─── Polling behavior ──────────────────────────────────────────────────────

  it('polls /batch/{requestId} until data is present', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-abc' }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
      .mockResolvedValueOnce(jsonResponse({ success: true })) // data missing
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: [{ first_name: 'Jane' }], credits_left: 50 })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.output?.firstName).toBe('Jane');
    expect(result.output?.creditsLeft).toBe(50);
  });

  it('poll does NOT terminate on success:true with missing data (regression)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-abc' }))
      .mockResolvedValueOnce(jsonResponse({ success: true })) // no data field
      .mockResolvedValueOnce(jsonResponse({ success: true, data: [] })) // empty data
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ email: 'jane@example.com', first_name: 'Jane' }],
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.output?.email).toBe('jane@example.com');
    expect(result.output?.firstName).toBe('Jane');
  });

  it('poll terminates on success:false from GET and surfaces reason', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-abc' }))
      .mockResolvedValueOnce(jsonResponse({ success: false, reason: 'Invalid data' }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid data');
  });

  it('returns failure when POST returns success:false (credit exhaustion)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, reason: 'Insufficient credits' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient credits');
  });

  it('polling URL is /batch/{requestId} with api_key query param (URL-encoded)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req abc/1' }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: [{ first_name: 'Jane' }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test key=!' } })
    );
    await vi.runAllTimersAsync();
    await promise;

    const [pollUrl, pollInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(pollInit.method).toBe('GET');
    // request_id spaces and slashes must be URL-encoded
    expect(pollUrl).toContain('/batch/req%20abc%2F1');
    // api_key spaces and `=` must be URL-encoded; `!` is unreserved so it stays literal
    expect(pollUrl).toContain('api_key=test%20key%3D!');
  });

  // ─── Output mapping ────────────────────────────────────────────────────────

  it('maps snake_case API fields to camelCase output', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          credits_left: 42,
          data: [
            {
              email: 'jane@example.com',
              first_name: 'Jane',
              last_name: 'Doe',
              full_name: 'Jane Doe',
              mobile_phone: '+33 6 12',
              civility: 'Mrs',
              company: 'Acme',
              linkedin: 'https://linkedin.com/in/jane',
              siren: '123456789',
            },
          ],
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.output?.requestId).toBe('req-1');
    expect(result.output?.success).toBe(true);
    expect(result.output?.creditsLeft).toBe(42);
    expect(result.output?.email).toBe('jane@example.com');
    expect(result.output?.firstName).toBe('Jane');
    expect(result.output?.lastName).toBe('Doe');
    expect(result.output?.fullName).toBe('Jane Doe');
    expect(result.output?.mobilePhone).toBe('+33 6 12');
    expect(result.output?.civility).toBe('Mrs');
    expect(result.output?.company).toBe('Acme');
    expect(result.output?.linkedin).toBe('https://linkedin.com/in/jane');
    expect(result.output?.siren).toBe('123456789');
  });

  it('missing fields in API data[0] become null, not undefined', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: [{ email: 'jane@example.com' }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.output?.email).toBe('jane@example.com');
    expect(result.output?.firstName).toBeNull();
    expect(result.output?.lastName).toBeNull();
    expect(result.output?.phone).toBeNull();
    expect(result.output?.mobilePhone).toBeNull();
    expect(result.output?.company).toBeNull();
  });

  it('extra undocumented fields in data[0] are stripped from output', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ first_name: 'Jane', unexpected_field: 'xyz', another: 123 }],
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output && 'unexpected_field' in result.output).toBe(false);
    expect(result.output && 'another' in result.output).toBe(false);
  });

  it('empty data array is NOT a terminal success', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: [{ first_name: 'Jane' }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.output?.firstName).toBe('Jane');
  });

  it('data[0] with all null fields is still a terminal success', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ first_name: null, last_name: null, email: null, phone: null }],
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.output?.firstName).toBeNull();
    expect(result.output?.lastName).toBeNull();
    expect(result.output?.email).toBeNull();
    expect(result.output?.phone).toBeNull();
  });

  // ─── Failure paths ─────────────────────────────────────────────────────────

  it('returns failure on polling timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValue(jsonResponse({ success: true })); // always pending
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      { ...validInput, timeout: 1 },
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timed out/i);
  });

  it('returns failure on 401 from POST', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/401|auth/i);
  });

  it('returns failure on 5xx from POST after retries exhausted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('Server error', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/500|server/i);
  });

  it('network error on second poll is propagated', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNRESET');
  });

  it('429 during polling is retried by fetchWithRetry', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '0' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: [{ first_name: 'Jane' }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.output?.firstName).toBe('Jane');
  });

  // ─── Extra coverage (from /review feedback) ────────────────────────────────

  it('returns failure when submit returns 2xx but missing request_id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true })); // no request_id
    vi.stubGlobal('fetch', fetchMock);

    const result = await dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/request_id/i);
  });

  it('maps non-string API field values to null', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [
            {
              first_name: 'Jane',
              last_name: 42, // number — should become null
              phone: ['+1', '+2'], // array — should become null
              company: { name: 'Acme' }, // object — should become null
              email: true, // boolean — should become null
            },
          ],
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.output?.firstName).toBe('Jane');
    expect(result.output?.lastName).toBeNull();
    expect(result.output?.phone).toBeNull();
    expect(result.output?.company).toBeNull();
    expect(result.output?.email).toBeNull();
  });

  it('preserves creditsLeft from submit response when poll response omits it', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, request_id: 'req-1', credits_left: 73 })
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: [{ first_name: 'Jane' }] })
      ); // credits_left intentionally missing from poll
    vi.stubGlobal('fetch', fetchMock);

    const promise = dropcontactEnrichNode.executor(
      validInput,
      makeContext({ dropcontact: { apiKey: 'test-key' } })
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.output?.creditsLeft).toBe(73);
  });
});

// =============================================================================
// executeNode integration (full engine path)
// =============================================================================

describe('executeNode integration', () => {
  it('successful enrichment via executeNode validates output schema', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1', credits_left: 10 }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [
            {
              email: 'jane@example.com',
              first_name: 'Jane',
              last_name: 'Doe',
              company: 'Acme',
            },
          ],
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const ctx = makeContext({ dropcontact: { apiKey: 'test-key' } });
    const promise = executeNode(dropcontactEnrichNode, validInput, ctx);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    // output should validate against DropcontactEnrichOutputSchema
    const parsed = DropcontactEnrichOutputSchema.safeParse(result.output);
    expect(parsed.success).toBe(true);
  });

  it('engine-level timeout aborts polling', async () => {
    // Use REAL timers because executeNode's Promise.race uses real setTimeout
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, request_id: 'req-1' }))
      .mockResolvedValue(jsonResponse({ success: true })); // always pending
    vi.stubGlobal('fetch', fetchMock);

    const ctx = makeContext({ dropcontact: { apiKey: 'test-key' } });
    const result = await executeNode(dropcontactEnrichNode, validInput, ctx, { timeout: 50 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timeout|timed out/i);
  }, 10_000);

  it('input schema validation throws ZodError via engine', async () => {
    // executeNode calls inputSchema.parse() which throws on invalid input.
    // This documents the engine's current behavior (no try/catch around parse).
    const ctx = makeContext({ dropcontact: { apiKey: 'test-key' } });
    await expect(
      executeNode(
        dropcontactEnrichNode,
        // @ts-expect-error — deliberately bad input
        { email: 'not-an-email' },
        ctx
      )
    ).rejects.toThrow();
  });
});
