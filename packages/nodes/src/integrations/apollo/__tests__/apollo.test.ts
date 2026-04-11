import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apolloCredential,
  apolloEnrichPersonNode,
  apolloEnrichCompanyNode,
  apolloGetEmailStatusNode,
  ApolloEnrichPersonInputSchema,
  ApolloEnrichCompanyInputSchema,
  ApolloGetEmailStatusInputSchema,
  mapApolloEmailStatus,
} from '../index.js'
import { builtInNodes } from '../../../index.js'

const mockContext = {
  userId: 'u1',
  workflowExecutionId: 'w1',
  variables: {},
  resolveNestedPath: () => undefined,
  credentials: { apollo: { apiKey: 'test-api-key' } },
} as const

const mockContextNoCreds = {
  userId: 'u1',
  workflowExecutionId: 'w1',
  variables: {},
  resolveNestedPath: () => undefined,
} as const

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ─── apolloCredential ────────────────────────────────────────────────────────

describe('apolloCredential', () => {
  it('defines credential metadata', () => {
    expect(apolloCredential.name).toBe('apollo')
    expect(apolloCredential.type).toBe('apiKey')
    expect(apolloCredential.displayName).toBe('Apollo.io API Key')
  })

  it('uses X-Api-Key header with apiKey template', () => {
    expect(apolloCredential.authenticate.type).toBe('header')
    expect(
      (apolloCredential.authenticate as { properties: Record<string, string> })
        .properties['X-Api-Key'],
    ).toBe('{{apiKey}}')
  })

  it('schema accepts a string apiKey', () => {
    const result = apolloCredential.schema.safeParse({ apiKey: 'abc' })
    expect(result.success).toBe(true)
  })

  it('schema rejects missing apiKey', () => {
    const result = apolloCredential.schema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ─── apolloEnrichPersonNode ──────────────────────────────────────────────────

describe('apollo_enrich_person', () => {
  const samplePerson = {
    id: 'p_123',
    name: 'Jane Doe',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    title: 'VP Engineering',
    linkedin_url: 'https://linkedin.com/in/jane',
    email_status: 'verified',
    organization: {
      name: 'Acme Corp',
    },
    city: 'San Francisco',
    state: 'CA',
    country: 'United States',
  }

  it('fails when API key is missing', async () => {
    const result = await apolloEnrichPersonNode.executor(
      { email: 'jane@example.com' },
      mockContextNoCreds,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('apollo.apiKey')
  })

  it('sends POST to /api/v1/people/match with email and X-Api-Key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ person: samplePerson }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apolloEnrichPersonNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/people/match')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Api-Key']).toBe('test-api-key')
    expect(headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(String(init.body))
    expect(body.email).toBe('jane@example.com')
  })

  it('sends reveal_personal_emails: true in request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ person: samplePerson }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apolloEnrichPersonNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.reveal_personal_emails).toBe(true)
  })

  it('returns normalized person on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ person: samplePerson }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichPersonNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      const person = result.output?.person
      expect(person).not.toBeNull()
      expect(person?.id).toBe('p_123')
      expect(person?.firstName).toBe('Jane')
      expect(person?.lastName).toBe('Doe')
      expect(person?.email).toBe('jane@example.com')
      expect(person?.title).toBe('VP Engineering')
      expect(person?.company).toBe('Acme Corp')
      expect(person?.linkedinUrl).toBe('https://linkedin.com/in/jane')
      expect(person?.city).toBe('San Francisco')
      expect(person?.state).toBe('CA')
      expect(person?.country).toBe('United States')
    }
  })

  it('handles null organization on the person object', async () => {
    const personWithoutOrg = { ...samplePerson, organization: null }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ person: personWithoutOrg }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichPersonNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.person?.company).toBeNull()
    }
  })

  it('handles missing nested fields', async () => {
    const sparsePerson = {
      id: 'p_456',
      first_name: 'Bob',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ person: sparsePerson }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichPersonNode.executor(
      { email: 'bob@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      const person = result.output?.person
      expect(person?.id).toBe('p_456')
      expect(person?.firstName).toBe('Bob')
      expect(person?.lastName).toBeNull()
      expect(person?.email).toBeNull()
      expect(person?.title).toBeNull()
      expect(person?.company).toBeNull()
      expect(person?.linkedinUrl).toBeNull()
      expect(person?.city).toBeNull()
      expect(person?.state).toBeNull()
      expect(person?.country).toBeNull()
    }
  })

  it('returns { person: null } when Apollo returns no match', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ person: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichPersonNode.executor(
      { email: 'nobody@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.person).toBeNull()
    }
  })

  it('returns { person: null } when Apollo returns an empty body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichPersonNode.executor(
      { email: 'nobody@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.person).toBeNull()
    }
  })

  it('returns failure with status code when Apollo returns 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('internal server error', { status: 500 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichPersonNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('500')
  })

  it('returns failure when fetch throws a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichPersonNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(result.error?.length ?? 0).toBeGreaterThan(0)
  })

  it('rejects invalid email input via schema', () => {
    const result = ApolloEnrichPersonInputSchema.safeParse({
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty input via schema', () => {
    const result = ApolloEnrichPersonInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ─── apolloEnrichCompanyNode ─────────────────────────────────────────────────

describe('apollo_enrich_company', () => {
  const sampleOrg = {
    id: 'o_42',
    name: 'Acme Corp',
    website_url: 'https://acme.example.com',
    linkedin_url: 'https://linkedin.com/company/acme',
    industry: 'Software',
    estimated_num_employees: 250,
    founded_year: 2010,
  }

  it('fails when API key is missing', async () => {
    const result = await apolloEnrichCompanyNode.executor(
      { domain: 'acme.example.com' },
      mockContextNoCreds,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('apollo.apiKey')
  })

  it('sends request to /organizations/enrich with domain and X-Api-Key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ organization: sampleOrg }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apolloEnrichCompanyNode.executor(
      { domain: 'acme.example.com' },
      mockContext,
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/organizations/enrich')
    expect(url).toContain('domain=acme.example.com')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Api-Key']).toBe('test-api-key')
  })

  it('returns normalized organization on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ organization: sampleOrg }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichCompanyNode.executor(
      { domain: 'acme.example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      const org = result.output?.organization
      expect(org).not.toBeNull()
      expect(org?.id).toBe('o_42')
      expect(org?.name).toBe('Acme Corp')
      expect(org?.websiteUrl).toBe('https://acme.example.com')
      expect(org?.linkedinUrl).toBe('https://linkedin.com/company/acme')
      expect(org?.industry).toBe('Software')
      expect(org?.estimatedNumEmployees).toBe(250)
      expect(org?.foundedYear).toBe(2010)
    }
  })

  it('handles missing nested fields', async () => {
    const sparseOrg = { id: 'o_99', name: 'Minimal Co' }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ organization: sparseOrg }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichCompanyNode.executor(
      { domain: 'minimal.example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      const org = result.output?.organization
      expect(org?.id).toBe('o_99')
      expect(org?.name).toBe('Minimal Co')
      expect(org?.websiteUrl).toBeNull()
      expect(org?.linkedinUrl).toBeNull()
      expect(org?.industry).toBeNull()
      expect(org?.estimatedNumEmployees).toBeNull()
      expect(org?.foundedYear).toBeNull()
    }
  })

  it('returns { organization: null } when Apollo returns no match', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ organization: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichCompanyNode.executor(
      { domain: 'nowhere.example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.organization).toBeNull()
    }
  })

  it('returns { organization: null } when Apollo returns an empty body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichCompanyNode.executor(
      { domain: 'nowhere.example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.organization).toBeNull()
    }
  })

  it('returns failure with status on 4xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('not found', { status: 404 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichCompanyNode.executor(
      { domain: 'acme.example.com' },
      mockContext,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('404')
  })

  it('returns failure when fetch throws a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ENETUNREACH'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloEnrichCompanyNode.executor(
      { domain: 'acme.example.com' },
      mockContext,
    )

    expect(result.success).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(result.error?.length ?? 0).toBeGreaterThan(0)
  })

  it('rejects empty domain via schema', () => {
    const result = ApolloEnrichCompanyInputSchema.safeParse({ domain: '' })
    expect(result.success).toBe(false)
  })
})

// ─── apolloGetEmailStatusNode ────────────────────────────────────────────────

describe('apollo_get_email_status', () => {
  it('fails when API key is missing', async () => {
    const result = await apolloGetEmailStatusNode.executor(
      { email: 'jane@example.com' },
      mockContextNoCreds,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('apollo.apiKey')
  })

  it('maps Apollo "verified" status to valid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          person: { email_status: 'verified' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloGetEmailStatusNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.status).toBe('valid')
      expect(result.output?.deliverability).toBe('verified')
    }
  })

  it('maps Apollo "unverified" status to invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ person: { email_status: 'unverified' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloGetEmailStatusNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.status).toBe('invalid')
      expect(result.output?.deliverability).toBe('unverified')
    }
  })

  it('maps Apollo "likely_to_bounce" status to invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ person: { email_status: 'likely_to_bounce' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloGetEmailStatusNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.status).toBe('invalid')
    }
  })

  it('maps unknown Apollo status to unknown', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ person: { email_status: 'catch-all' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloGetEmailStatusNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.status).toBe('unknown')
      expect(result.output?.deliverability).toBe('catch-all')
    }
  })

  it('maps empty or missing email_status to unknown', async () => {
    const fetchMockEmpty = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ person: { email_status: '' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMockEmpty)

    const result1 = await apolloGetEmailStatusNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )
    expect(result1.success).toBe(true)
    if (result1.success) {
      expect(result1.output?.status).toBe('unknown')
    }

    const fetchMockMissing = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ person: { id: 'p1' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMockMissing)

    const result2 = await apolloGetEmailStatusNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )
    expect(result2.success).toBe(true)
    if (result2.success) {
      expect(result2.output?.status).toBe('unknown')
      expect(result2.output?.deliverability).toBeNull()
    }
  })

  it('returns unknown with null deliverability when Apollo returns { person: null }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ person: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloGetEmailStatusNode.executor(
      { email: 'nobody@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.status).toBe('unknown')
      expect(result.output?.deliverability).toBeNull()
    }
  })

  it('returns unknown with null deliverability when Apollo returns an empty body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloGetEmailStatusNode.executor(
      { email: 'nobody@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.status).toBe('unknown')
      expect(result.output?.deliverability).toBeNull()
    }
  })

  it('returns failure when Apollo returns 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('server error', { status: 500 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloGetEmailStatusNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('500')
  })

  it('returns failure when fetch throws a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apolloGetEmailStatusNode.executor(
      { email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(result.error?.length ?? 0).toBeGreaterThan(0)
  })

  it('rejects invalid email input via schema', () => {
    const result = ApolloGetEmailStatusInputSchema.safeParse({
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('status mapping helper is exported and unit-testable', () => {
    expect(mapApolloEmailStatus('verified')).toBe('valid')
    expect(mapApolloEmailStatus('unverified')).toBe('invalid')
    expect(mapApolloEmailStatus('likely_to_bounce')).toBe('invalid')
    expect(mapApolloEmailStatus('bounced')).toBe('invalid')
    expect(mapApolloEmailStatus('catch-all')).toBe('unknown')
    expect(mapApolloEmailStatus('')).toBe('unknown')
    expect(mapApolloEmailStatus(null)).toBe('unknown')
    expect(mapApolloEmailStatus(undefined)).toBe('unknown')
  })
})

// ─── Integration / barrel exports ────────────────────────────────────────────

describe('apollo integration exports', () => {
  it('exports the credential and three new nodes from the apollo barrel', () => {
    expect(apolloCredential).toBeDefined()
    expect(apolloEnrichPersonNode).toBeDefined()
    expect(apolloEnrichCompanyNode).toBeDefined()
    expect(apolloGetEmailStatusNode).toBeDefined()
    expect(apolloEnrichPersonNode.type).toBe('apollo_enrich_person')
    expect(apolloEnrichCompanyNode.type).toBe('apollo_enrich_company')
    expect(apolloGetEmailStatusNode.type).toBe('apollo_get_email_status')
  })

  it('builtInNodes includes the three new Apollo nodes', () => {
    const types = builtInNodes.map((n) => n.type)
    expect(types).toContain('apollo_enrich_person')
    expect(types).toContain('apollo_enrich_company')
    expect(types).toContain('apollo_get_email_status')
  })
})
