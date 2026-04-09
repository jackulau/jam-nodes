import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hunterCredential,
  hunterDomainSearchNode,
  hunterEmailFinderNode,
  hunterEmailVerifierNode,
  HunterDomainSearchInputSchema,
  HunterEmailFinderInputSchema,
  HunterEmailVerifierInputSchema,
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
  credentials: { hunter: { apiKey: 'test-hunter-key' } },
};

// ─── Credential metadata ───────────────────────────────────────────────────

describe('hunter credentials', () => {
  it('defines apiKey credential metadata', () => {
    expect(hunterCredential.name).toBe('hunter');
    expect(hunterCredential.type).toBe('apiKey');
    expect(hunterCredential.displayName).toBe('Hunter.io API Key');
  });

  it('uses query param authentication', () => {
    expect(hunterCredential.authenticate.type).toBe('query');
    expect(hunterCredential.authenticate.properties.api_key).toBe('{{apiKey}}');
  });

  it('includes documentation URL', () => {
    expect(hunterCredential.documentationUrl).toBe('https://hunter.io/api-documentation/v2');
  });
});

// ─── Schema validation ─────────────────────────────────────────────────────

describe('hunter schemas', () => {
  // Domain Search
  it('validates domain search input with required domain', () => {
    const result = HunterDomainSearchInputSchema.safeParse({ domain: 'example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects domain search input missing domain', () => {
    const result = HunterDomainSearchInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects domain search input with empty domain', () => {
    const result = HunterDomainSearchInputSchema.safeParse({ domain: '' });
    expect(result.success).toBe(false);
  });

  it('validates domain search with optional filters', () => {
    const result = HunterDomainSearchInputSchema.safeParse({
      domain: 'example.com',
      limit: 50,
      type: 'personal',
      seniority: ['senior', 'executive'],
      department: ['sales', 'marketing'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects domain search with invalid seniority value', () => {
    const result = HunterDomainSearchInputSchema.safeParse({
      domain: 'example.com',
      seniority: ['intern'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects domain search with limit out of range (0)', () => {
    const result = HunterDomainSearchInputSchema.safeParse({
      domain: 'example.com',
      limit: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects domain search with limit out of range (101)', () => {
    const result = HunterDomainSearchInputSchema.safeParse({
      domain: 'example.com',
      limit: 101,
    });
    expect(result.success).toBe(false);
  });

  // Email Finder
  it('validates email finder input with all required fields', () => {
    const result = HunterEmailFinderInputSchema.safeParse({
      domain: 'example.com',
      firstName: 'John',
      lastName: 'Doe',
    });
    expect(result.success).toBe(true);
  });

  it('rejects email finder input missing firstName', () => {
    const result = HunterEmailFinderInputSchema.safeParse({
      domain: 'example.com',
      lastName: 'Doe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects email finder input with empty strings', () => {
    const result = HunterEmailFinderInputSchema.safeParse({
      domain: '',
      firstName: '',
      lastName: '',
    });
    expect(result.success).toBe(false);
  });

  // Email Verifier
  it('validates email verifier input', () => {
    const result = HunterEmailVerifierInputSchema.safeParse({ email: 'test@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects email verifier input missing email', () => {
    const result = HunterEmailVerifierInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects email verifier input with empty email', () => {
    const result = HunterEmailVerifierInputSchema.safeParse({ email: '' });
    expect(result.success).toBe(false);
  });
});

// ─── hunter_domain_search ──────────────────────────────────────────────────

describe('hunter_domain_search', () => {
  const mockDomainSearchResponse = {
    data: {
      emails: [
        {
          value: 'john@example.com',
          type: 'personal',
          confidence: 95,
          first_name: 'John',
          last_name: 'Doe',
          position: 'CEO',
          department: 'executive',
          sources: [
            {
              domain: 'example.com',
              uri: 'https://example.com/about',
              extracted_on: '2024-01-01',
              last_seen_on: '2024-06-01',
              still_on_page: true,
            },
          ],
        },
        {
          value: 'info@example.com',
          type: 'generic',
          confidence: 80,
          first_name: null,
          last_name: null,
          position: null,
          department: null,
          sources: [],
        },
      ],
      meta: { results: 2, limit: 10, offset: 0 },
    },
  };

  it('fails when API key is missing', async () => {
    const result = await hunterDomainSearchNode.executor(
      { domain: 'example.com' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('hunter.apiKey');
  });

  it('searches domain and returns emails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockDomainSearchResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterDomainSearchNode.executor(
      { domain: 'example.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.emails).toHaveLength(2);
      expect(result.output.emails[0]?.value).toBe('john@example.com');
      expect(result.output.emails[0]?.firstName).toBe('John');
      expect(result.output.emails[0]?.lastName).toBe('Doe');
      expect(result.output.emails[0]?.position).toBe('CEO');
      expect(result.output.emails[0]?.confidence).toBe(95);
      expect(result.output.meta.results).toBe(2);
      expect(result.output.meta.limit).toBe(10);
      expect(result.output.meta.offset).toBe(0);
    }
  });

  it('sends api_key as query parameter in URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockDomainSearchResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await hunterDomainSearchNode.executor(
      { domain: 'example.com' },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('api_key')).toBe('test-hunter-key');
  });

  it('sends domain as query parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockDomainSearchResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await hunterDomainSearchNode.executor(
      { domain: 'stripe.com' },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('domain')).toBe('stripe.com');
  });

  it('sends optional filters as query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockDomainSearchResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await hunterDomainSearchNode.executor(
      {
        domain: 'example.com',
        limit: 50,
        type: 'personal',
        seniority: ['senior', 'executive'],
        department: ['sales', 'marketing'],
      },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('limit')).toBe('50');
    expect(params.get('type')).toBe('personal');
    expect(params.get('seniority')).toBe('senior,executive');
    expect(params.get('department')).toBe('sales,marketing');
  });

  it('maps snake_case response to camelCase output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockDomainSearchResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterDomainSearchNode.executor(
      { domain: 'example.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      const email = result.output.emails[0]!;
      expect(email.firstName).toBe('John');
      expect(email.lastName).toBe('Doe');
      expect(email.sources[0]?.extractedOn).toBe('2024-01-01');
      expect(email.sources[0]?.lastSeenOn).toBe('2024-06-01');
      expect(email.sources[0]?.stillOnPage).toBe(true);
    }
  });

  it('returns error on 401', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('Authentication error: 401 Unauthorized'), {
        name: 'FetchRetryError',
        status: 401,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterDomainSearchNode.executor(
      { domain: 'example.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns error on 429', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('Rate limit exceeded after 3 attempts'), {
        name: 'FetchRetryError',
        status: 429,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterDomainSearchNode.executor(
      { domain: 'example.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limit');
  });

  it('returns error on 5xx', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('Server error: 500 Internal Server Error'), {
        name: 'FetchRetryError',
        status: 500,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterDomainSearchNode.executor(
      { domain: 'example.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('handles empty email results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { emails: [], meta: { results: 0, limit: 10, offset: 0 } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterDomainSearchNode.executor(
      { domain: 'unknown-domain.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.emails).toHaveLength(0);
      expect(result.output.meta.results).toBe(0);
    }
  });

  it('handles network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network request failed'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterDomainSearchNode.executor(
      { domain: 'example.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network request failed');
  });
});

// ─── hunter_email_finder ───────────────────────────────────────────────────

describe('hunter_email_finder', () => {
  const mockEmailFinderResponse = {
    data: {
      email: 'john.doe@example.com',
      score: 92,
      position: 'CEO',
      company: 'Example Inc',
    },
  };

  it('fails when API key is missing', async () => {
    const result = await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'John', lastName: 'Doe' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('hunter.apiKey');
  });

  it('finds email for person at domain', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockEmailFinderResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'John', lastName: 'Doe' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.email).toBe('john.doe@example.com');
      expect(result.output.score).toBe(92);
      expect(result.output.position).toBe('CEO');
      expect(result.output.company).toBe('Example Inc');
    }
  });

  it('sends first_name and last_name as snake_case query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockEmailFinderResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'John', lastName: 'Doe' },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('first_name')).toBe('John');
    expect(params.get('last_name')).toBe('Doe');
  });

  it('sends api_key as query parameter in URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockEmailFinderResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'John', lastName: 'Doe' },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('api_key')).toBe('test-hunter-key');
  });

  it('URL-encodes special characters in names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockEmailFinderResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'Jean-Claude', lastName: "O'Brien" },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('first_name')).toBe('Jean-Claude');
    expect(params.get('last_name')).toBe("O'Brien");
  });

  it('returns error on API failure (401)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('Authentication error: 401 Unauthorized'), {
        name: 'FetchRetryError',
        status: 401,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'John', lastName: 'Doe' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns error on 5xx', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('Server error: 500 Internal Server Error'), {
        name: 'FetchRetryError',
        status: 500,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'John', lastName: 'Doe' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('handles null/missing fields in response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { email: null, score: 0, position: null, company: null },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'Unknown', lastName: 'Person' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.email).toBeNull();
      expect(result.output.score).toBe(0);
      expect(result.output.position).toBeNull();
      expect(result.output.company).toBeNull();
    }
  });

  it('handles network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network request failed'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'John', lastName: 'Doe' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network request failed');
  });
});

// ─── hunter_email_verifier ─────────────────────────────────────────────────

describe('hunter_email_verifier', () => {
  const mockVerifierResponse = {
    data: {
      status: 'valid',
      score: 95,
      regexp: true,
      gibberish: false,
      disposable: false,
      webmail: false,
      mx_records: true,
      smtp_server: true,
      smtp_check: true,
      accept_all: false,
    },
  };

  it('fails when API key is missing', async () => {
    const result = await hunterEmailVerifierNode.executor(
      { email: 'test@example.com' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('hunter.apiKey');
  });

  it('verifies email and returns all fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockVerifierResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailVerifierNode.executor(
      { email: 'test@example.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.status).toBe('valid');
      expect(result.output.score).toBe(95);
      expect(result.output.regexp).toBe(true);
      expect(result.output.gibberish).toBe(false);
      expect(result.output.disposable).toBe(false);
      expect(result.output.webmail).toBe(false);
      expect(result.output.mxRecords).toBe(true);
      expect(result.output.smtpServer).toBe(true);
      expect(result.output.smtpCheck).toBe(true);
      expect(result.output.acceptAll).toBe(false);
    }
  });

  it('sends email and api_key as query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockVerifierResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await hunterEmailVerifierNode.executor(
      { email: 'test@example.com' },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('api_key')).toBe('test-hunter-key');
    expect(params.get('email')).toBe('test@example.com');
  });

  it('maps all snake_case fields to camelCase', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockVerifierResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailVerifierNode.executor(
      { email: 'test@example.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // Verify snake_case -> camelCase mapping
      expect(result.output).toHaveProperty('mxRecords');
      expect(result.output).toHaveProperty('smtpServer');
      expect(result.output).toHaveProperty('smtpCheck');
      expect(result.output).toHaveProperty('acceptAll');
      // Verify no snake_case keys leak through
      expect(result.output).not.toHaveProperty('mx_records');
      expect(result.output).not.toHaveProperty('smtp_server');
      expect(result.output).not.toHaveProperty('smtp_check');
      expect(result.output).not.toHaveProperty('accept_all');
    }
  });

  it('all boolean fields are mapped correctly', async () => {
    const allTrueResponse = {
      data: {
        status: 'valid',
        score: 100,
        regexp: true,
        gibberish: true,
        disposable: true,
        webmail: true,
        mx_records: true,
        smtp_server: true,
        smtp_check: true,
        accept_all: true,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(allTrueResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailVerifierNode.executor(
      { email: 'test@example.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.regexp).toBe(true);
      expect(result.output.gibberish).toBe(true);
      expect(result.output.disposable).toBe(true);
      expect(result.output.webmail).toBe(true);
      expect(result.output.mxRecords).toBe(true);
      expect(result.output.smtpServer).toBe(true);
      expect(result.output.smtpCheck).toBe(true);
      expect(result.output.acceptAll).toBe(true);
    }
  });

  it('returns error on API failure (401)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('Authentication error: 401 Unauthorized'), {
        name: 'FetchRetryError',
        status: 401,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailVerifierNode.executor(
      { email: 'test@example.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns error on 5xx', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('Server error: 500 Internal Server Error'), {
        name: 'FetchRetryError',
        status: 500,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailVerifierNode.executor(
      { email: 'test@example.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('handles unverifiable email (status unknown)', async () => {
    const unknownResponse = {
      data: {
        status: 'unknown',
        score: 0,
        regexp: true,
        gibberish: false,
        disposable: false,
        webmail: false,
        mx_records: false,
        smtp_server: false,
        smtp_check: false,
        accept_all: false,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(unknownResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailVerifierNode.executor(
      { email: 'unknown@mystery.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.status).toBe('unknown');
      expect(result.output.score).toBe(0);
    }
  });

  it('handles network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network request failed'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await hunterEmailVerifierNode.executor(
      { email: 'test@example.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network request failed');
  });
});

// ─── Integration tests ─────────────────────────────────────────────────────

describe('hunter integration flow', () => {
  it('domain search -> email finder -> email verifier flow', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes('/domain-search')) {
        return new Response(
          JSON.stringify({
            data: {
              emails: [
                {
                  value: 'john@example.com',
                  type: 'personal',
                  confidence: 90,
                  first_name: 'John',
                  last_name: 'Doe',
                  position: 'CTO',
                  department: 'it',
                  sources: [],
                },
              ],
              meta: { results: 1, limit: 10, offset: 0 },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/email-finder')) {
        return new Response(
          JSON.stringify({
            data: { email: 'john.doe@example.com', score: 95, position: 'CTO', company: 'Example' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/email-verifier')) {
        return new Response(
          JSON.stringify({
            data: {
              status: 'valid',
              score: 95,
              regexp: true,
              gibberish: false,
              disposable: false,
              webmail: false,
              mx_records: true,
              smtp_server: true,
              smtp_check: true,
              accept_all: false,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // Step 1: Domain search
    const searchResult = await hunterDomainSearchNode.executor(
      { domain: 'example.com' },
      authedContext
    );
    expect(searchResult.success).toBe(true);

    // Step 2: Email finder
    const finderResult = await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'John', lastName: 'Doe' },
      authedContext
    );
    expect(finderResult.success).toBe(true);

    // Step 3: Email verifier
    const verifierResult = await hunterEmailVerifierNode.executor(
      { email: 'john.doe@example.com' },
      authedContext
    );
    expect(verifierResult.success).toBe(true);

    expect(callCount).toBe(3);
  });

  it('all nodes fail identically when credentials are missing', async () => {
    const domainResult = await hunterDomainSearchNode.executor(
      { domain: 'example.com' },
      baseContext
    );
    const finderResult = await hunterEmailFinderNode.executor(
      { domain: 'example.com', firstName: 'John', lastName: 'Doe' },
      baseContext
    );
    const verifierResult = await hunterEmailVerifierNode.executor(
      { email: 'test@example.com' },
      baseContext
    );

    expect(domainResult.success).toBe(false);
    expect(finderResult.success).toBe(false);
    expect(verifierResult.success).toBe(false);

    expect(domainResult.error).toContain('hunter.apiKey');
    expect(finderResult.error).toContain('hunter.apiKey');
    expect(verifierResult.error).toContain('hunter.apiKey');
  });
});
