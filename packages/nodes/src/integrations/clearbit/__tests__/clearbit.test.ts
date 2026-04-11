import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearbitCredential,
  clearbitEnrichPersonNode,
  clearbitEnrichCompanyNode,
  clearbitCompanyAutocompleteNode,
  ClearbitEnrichPersonInputSchema,
  ClearbitEnrichCompanyInputSchema,
  ClearbitCompanyAutocompleteInputSchema,
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
  credentials: { clearbit: { apiKey: 'test-clearbit-key' } },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Credential metadata ──────────────────────────────────────────────────────

describe('clearbit credential', () => {
  it('defines apiKey credential metadata', () => {
    expect(clearbitCredential.name).toBe('clearbit');
    expect(clearbitCredential.type).toBe('apiKey');
    expect(clearbitCredential.displayName).toBe('Clearbit API');
  });

  it('uses header Bearer authentication', () => {
    expect(clearbitCredential.authenticate.type).toBe('header');
    expect(clearbitCredential.authenticate.properties.Authorization).toBe('Bearer {{apiKey}}');
  });

  it('includes documentation URL', () => {
    expect(clearbitCredential.documentationUrl).toBe('https://clearbit.com/docs');
  });

  it('schema accepts valid apiKey', () => {
    const result = clearbitCredential.schema.safeParse({ apiKey: 'test-key' });
    expect(result.success).toBe(true);
  });

  it('schema rejects missing apiKey', () => {
    const result = clearbitCredential.schema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─── Schema validation ────────────────────────────────────────────────────────

describe('clearbit schemas', () => {
  // Enrich Person
  it('validates enrich person input with email only', () => {
    const result = ClearbitEnrichPersonInputSchema.safeParse({ email: 'alex@clearbit.com' });
    expect(result.success).toBe(true);
  });

  it('validates enrich person input with all optional fields', () => {
    const result = ClearbitEnrichPersonInputSchema.safeParse({
      email: 'alex@clearbit.com',
      givenName: 'Alex',
      familyName: 'MacCaw',
      company: 'Clearbit',
      companyDomain: 'clearbit.com',
      linkedIn: 'https://linkedin.com/in/alexmaccaw',
      twitter: 'maccaw',
    });
    expect(result.success).toBe(true);
  });

  it('rejects enrich person input missing email', () => {
    const result = ClearbitEnrichPersonInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects enrich person input with empty email', () => {
    const result = ClearbitEnrichPersonInputSchema.safeParse({ email: '' });
    expect(result.success).toBe(false);
  });

  // Enrich Company
  it('validates enrich company input with domain', () => {
    const result = ClearbitEnrichCompanyInputSchema.safeParse({ domain: 'stripe.com' });
    expect(result.success).toBe(true);
  });

  it('rejects enrich company input missing domain', () => {
    const result = ClearbitEnrichCompanyInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects enrich company input with empty domain', () => {
    const result = ClearbitEnrichCompanyInputSchema.safeParse({ domain: '' });
    expect(result.success).toBe(false);
  });

  // Company Autocomplete
  it('validates autocomplete input with name', () => {
    const result = ClearbitCompanyAutocompleteInputSchema.safeParse({ name: 'stripe' });
    expect(result.success).toBe(true);
  });

  it('rejects autocomplete input missing name', () => {
    const result = ClearbitCompanyAutocompleteInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects autocomplete input with empty name', () => {
    const result = ClearbitCompanyAutocompleteInputSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

// ─── clearbit_enrich_person ───────────────────────────────────────────────────

const mockPersonResponse = {
  id: 'd54c54ad-40be-4305-8a34-0ab44710b90d',
  name: {
    fullName: 'Alex MacCaw',
    givenName: 'Alex',
    familyName: 'MacCaw',
  },
  email: 'alex@clearbit.com',
  location: 'San Francisco, CA, USA',
  employment: {
    domain: 'clearbit.com',
    name: 'Clearbit',
    title: 'CEO',
    role: 'leadership',
    seniority: 'executive',
  },
  linkedin: { handle: 'alexmaccaw' },
  twitter: { handle: 'maccaw', followers: 15248 },
  facebook: { handle: 'amaccaw' },
  github: { handle: 'maccman' },
};

describe('clearbit_enrich_person', () => {
  it('fails when apiKey is missing', async () => {
    const result = await clearbitEnrichPersonNode.executor(
      { email: 'alex@clearbit.com' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('context.credentials.clearbit.apiKey');
  });

  it('enriches person by email', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockPersonResponse));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichPersonNode.executor(
      { email: 'alex@clearbit.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      id: 'd54c54ad-40be-4305-8a34-0ab44710b90d',
      name: {
        fullName: 'Alex MacCaw',
        givenName: 'Alex',
        familyName: 'MacCaw',
      },
      email: 'alex@clearbit.com',
      location: 'San Francisco, CA, USA',
      employment: {
        domain: 'clearbit.com',
        name: 'Clearbit',
        title: 'CEO',
        role: 'leadership',
        seniority: 'executive',
      },
      social: {
        linkedin: { handle: 'alexmaccaw' },
        twitter: { handle: 'maccaw', followers: 15248 },
        facebook: { handle: 'amaccaw' },
        github: { handle: 'maccman' },
      },
    });
  });

  it('targets the person-stream endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockPersonResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitEnrichPersonNode.executor({ email: 'alex@clearbit.com' }, authedContext);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://person-stream.clearbit.com/v2/people/find');
  });

  it('sends Authorization Bearer header on request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockPersonResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitEnrichPersonNode.executor({ email: 'alex@clearbit.com' }, authedContext);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-clearbit-key');
  });

  it('sends email as query param', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockPersonResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitEnrichPersonNode.executor({ email: 'alex@clearbit.com' }, authedContext);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('email=alex%40clearbit.com');
  });

  it('maps camelCase input to snake_case query params', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockPersonResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitEnrichPersonNode.executor(
      {
        email: 'alex@clearbit.com',
        givenName: 'Alex',
        familyName: 'MacCaw',
        company: 'Clearbit',
        companyDomain: 'clearbit.com',
        linkedIn: 'alexmaccaw',
        twitter: 'maccaw',
      },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('given_name=Alex');
    expect(url).toContain('family_name=MacCaw');
    expect(url).toContain('company=Clearbit');
    expect(url).toContain('company_domain=clearbit.com');
    expect(url).toContain('linkedin=alexmaccaw');
    expect(url).toContain('twitter=maccaw');
  });

  it('maps linkedIn input to lowercase linkedin URL param', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockPersonResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitEnrichPersonNode.executor(
      { email: 'a@b.com', linkedIn: 'foo' },
      authedContext
    );

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('linkedin=foo');
    expect(url).not.toContain('linkedIn=');
  });

  it('omits optional params when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockPersonResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitEnrichPersonNode.executor({ email: 'a@b.com' }, authedContext);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('given_name');
    expect(url).not.toContain('family_name');
    expect(url).not.toContain('company=');
  });

  it('handles nullable response fields', async () => {
    const sparseResponse = {
      id: 'xyz',
      name: { fullName: null, givenName: null, familyName: null },
      email: null,
      location: null,
      employment: {
        domain: null,
        name: null,
        title: null,
        role: null,
        seniority: null,
      },
      linkedin: null,
      twitter: null,
      facebook: null,
      github: null,
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(sparseResponse));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichPersonNode.executor(
      { email: 'a@b.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    expect(result.output?.email).toBeNull();
    expect(result.output?.location).toBeNull();
    expect(result.output?.social.linkedin).toBeNull();
    expect(result.output?.social.twitter).toBeNull();
    expect(result.output?.social.facebook).toBeNull();
    expect(result.output?.social.github).toBeNull();
  });

  it('handles missing social objects in raw response', async () => {
    const responseWithoutGithub = {
      id: 'xyz',
      name: { fullName: 'A', givenName: 'A', familyName: 'B' },
      email: 'a@b.com',
      location: 'SF',
      employment: {
        domain: 'example.com',
        name: 'Example',
        title: 'CEO',
        role: 'leadership',
        seniority: 'executive',
      },
      linkedin: { handle: 'a' },
      twitter: { handle: 'a', followers: 100 },
      // facebook and github absent
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(responseWithoutGithub));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichPersonNode.executor(
      { email: 'a@b.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    expect(result.output?.social.facebook).toBeNull();
    expect(result.output?.social.github).toBeNull();
  });

  it('returns error on 401 Unauthorized', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"error":"invalid token"}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichPersonNode.executor(
      { email: 'a@b.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns error on 404 Not Found', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"not found"}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichPersonNode.executor(
      { email: 'a@b.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });

  it('returns error when response is missing id', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichPersonNode.executor(
      { email: 'a@b.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing id');
  });

  it('returns error on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichPersonNode.executor(
      { email: 'a@b.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  }, 15000);
});

// ─── clearbit_enrich_company ──────────────────────────────────────────────────

const mockCompanyResponse = {
  id: 'c5a6adb1-20c2-4d81-9bf1-dfa00fcc6a46',
  name: 'Stripe',
  domain: 'stripe.com',
  category: {
    sector: 'Information Technology and Services',
    industryGroup: 'Software & Services',
    industry: 'Software',
    subIndustry: 'Application Software',
  },
  metrics: {
    employees: 1000,
    employeesRange: '501-1000',
    raised: 1600000000,
    marketCap: null,
    annualRevenue: null,
    alexaUsRank: 127,
    alexaGlobalRank: 289,
  },
  linkedin: { handle: 'company/stripe' },
  twitter: { handle: 'stripe', followers: 84000 },
  facebook: { handle: 'StripeHQ' },
};

describe('clearbit_enrich_company', () => {
  it('fails when apiKey is missing', async () => {
    const result = await clearbitEnrichCompanyNode.executor(
      { domain: 'stripe.com' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('context.credentials.clearbit.apiKey');
  });

  it('enriches company by domain', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockCompanyResponse));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichCompanyNode.executor(
      { domain: 'stripe.com' },
      authedContext
    );

    expect(result.success).toBe(true);
    expect(result.output?.id).toBe('c5a6adb1-20c2-4d81-9bf1-dfa00fcc6a46');
    expect(result.output?.name).toBe('Stripe');
    expect(result.output?.domain).toBe('stripe.com');
  });

  it('targets the company-stream endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockCompanyResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitEnrichCompanyNode.executor({ domain: 'stripe.com' }, authedContext);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://company-stream.clearbit.com/v2/companies/find');
    expect(url).toContain('domain=stripe.com');
  });

  it('sends Authorization Bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockCompanyResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitEnrichCompanyNode.executor({ domain: 'stripe.com' }, authedContext);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-clearbit-key');
  });

  it('maps category fields correctly', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockCompanyResponse));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichCompanyNode.executor(
      { domain: 'stripe.com' },
      authedContext
    );

    expect(result.output?.category).toEqual({
      sector: 'Information Technology and Services',
      industryGroup: 'Software & Services',
      industry: 'Software',
      subIndustry: 'Application Software',
    });
  });

  it('maps metrics fields correctly with nullable fields', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockCompanyResponse));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichCompanyNode.executor(
      { domain: 'stripe.com' },
      authedContext
    );

    expect(result.output?.metrics).toEqual({
      employees: 1000,
      employeesRange: '501-1000',
      raised: 1600000000,
      marketCap: null,
      annualRevenue: null,
      alexaUsRank: 127,
      alexaGlobalRank: 289,
    });
  });

  it('handles absent social platforms', async () => {
    const responseNoFacebook = {
      ...mockCompanyResponse,
      facebook: undefined,
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(responseNoFacebook));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichCompanyNode.executor(
      { domain: 'stripe.com' },
      authedContext
    );

    expect(result.output?.social.facebook).toBeNull();
    expect(result.output?.social.linkedin).not.toBeNull();
  });

  it('returns error on 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"error":"invalid token"}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichCompanyNode.executor(
      { domain: 'stripe.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns error on 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"not found"}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichCompanyNode.executor(
      { domain: 'nonexistent.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });

  it('returns error when response is missing id', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichCompanyNode.executor(
      { domain: 'stripe.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing id');
  });

  it('returns error on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitEnrichCompanyNode.executor(
      { domain: 'stripe.com' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  }, 15000);
});

// ─── clearbit_company_autocomplete ────────────────────────────────────────────

const mockAutocompleteResponse = [
  { name: 'Stripe', domain: 'stripe.com', logo: 'https://logo.clearbit.com/stripe.com' },
  { name: 'Stripe, Inc.', domain: 'stripe.co.uk', logo: 'https://logo.clearbit.com/stripe.co.uk' },
];

describe('clearbit_company_autocomplete', () => {
  it('fails when apiKey is missing', async () => {
    const result = await clearbitCompanyAutocompleteNode.executor(
      { name: 'stripe' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('context.credentials.clearbit.apiKey');
  });

  it('autocompletes company name', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockAutocompleteResponse));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitCompanyAutocompleteNode.executor(
      { name: 'stripe' },
      authedContext
    );

    expect(result.success).toBe(true);
    expect(result.output?.companies).toHaveLength(2);
    expect(result.output?.companies[0]).toEqual({
      name: 'Stripe',
      domain: 'stripe.com',
      logo: 'https://logo.clearbit.com/stripe.com',
    });
  });

  it('targets the autocomplete endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockAutocompleteResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitCompanyAutocompleteNode.executor({ name: 'stripe' }, authedContext);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://autocomplete.clearbit.com/v1/companies/suggest');
  });

  it('maps input name to URL query param', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockAutocompleteResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitCompanyAutocompleteNode.executor({ name: 'stripe' }, authedContext);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('query=stripe');
    expect(url).not.toContain('name=stripe');
  });

  it('sends Authorization Bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(mockAutocompleteResponse));
    vi.stubGlobal('fetch', fetchMock);

    await clearbitCompanyAutocompleteNode.executor({ name: 'stripe' }, authedContext);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-clearbit-key');
  });

  it('handles empty autocomplete results', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitCompanyAutocompleteNode.executor(
      { name: 'xyznonexistent' },
      authedContext
    );

    expect(result.success).toBe(true);
    expect(result.output?.companies).toEqual([]);
  });

  it('returns error on non-OK response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"bad request"}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitCompanyAutocompleteNode.executor(
      { name: 'stripe' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('400');
  });

  it('returns error when response is not an array', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'bad shape' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitCompanyAutocompleteNode.executor(
      { name: 'stripe' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('expected array');
  });

  it('returns error on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await clearbitCompanyAutocompleteNode.executor(
      { name: 'stripe' },
      authedContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  }, 15000);
});

// ─── Integration tests ────────────────────────────────────────────────────────

describe('clearbit integration — all nodes fail without credentials', () => {
  it('all 3 nodes return structured error mentioning clearbit.apiKey', async () => {
    const person = await clearbitEnrichPersonNode.executor(
      { email: 'a@b.com' },
      baseContext
    );
    const company = await clearbitEnrichCompanyNode.executor(
      { domain: 'example.com' },
      baseContext
    );
    const autocomplete = await clearbitCompanyAutocompleteNode.executor(
      { name: 'x' },
      baseContext
    );

    expect(person.success).toBe(false);
    expect(person.error).toContain('context.credentials.clearbit.apiKey');
    expect(company.success).toBe(false);
    expect(company.error).toContain('context.credentials.clearbit.apiKey');
    expect(autocomplete.success).toBe(false);
    expect(autocomplete.error).toContain('context.credentials.clearbit.apiKey');
  });
});
