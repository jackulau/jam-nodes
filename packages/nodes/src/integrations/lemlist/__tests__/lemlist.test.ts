import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  lemlistCredential,
  lemlistAddLeadNode,
  lemlistGetCampaignsNode,
  lemlistGetActivityNode,
  lemlistPauseLeadNode,
  lemlistResumeLeadNode,
  lemlistMarkAsInterestedNode,
  LemlistAddLeadInputSchema,
  LemlistGetCampaignsInputSchema,
  LemlistGetActivityInputSchema,
  LemlistPauseLeadInputSchema,
  LemlistResumeLeadInputSchema,
  LemlistMarkAsInterestedInputSchema,
  buildLemlistAuthHeader,
  buildLemlistHeaders,
  LEMLIST_API_BASE,
} from '../index.js'

const mockContext = {
  userId: 'u1',
  workflowExecutionId: 'w1',
  variables: {},
  resolveNestedPath: () => undefined,
  credentials: { lemlist: { apiKey: 'test-api-key' } },
} as const

const mockContextNoCreds = {
  userId: 'u1',
  workflowExecutionId: 'w1',
  variables: {},
  resolveNestedPath: () => undefined,
} as const

const mockLead = {
  _id: 'lea_abc123',
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  companyName: 'Acme Corp',
  jobTitle: 'Founder',
  companyDomain: 'acme.com',
  isPaused: false,
  campaignId: 'cam_xyz789',
  contactId: 'ctc_pqr456',
  emailStatus: 'deliverable',
}

const mockCampaign = {
  _id: 'cam_xyz789',
  name: 'Q2 Outreach',
  status: 'running',
  labels: ['outbound'],
  createdAt: '2025-01-15T10:00:00Z',
  createdBy: 'usr_me',
  sequenceId: 'seq_111',
  scheduleIds: ['sch_222'],
  teamId: 'team_333',
  hasError: false,
  errors: [],
}

const mockActivity = {
  _id: 'act_aaa',
  type: 'emailOpened',
  leadId: 'lea_abc123',
  campaignId: 'cam_xyz789',
  sequenceId: 'seq_111',
  sequenceStep: 0,
  createdAt: '2025-02-01T09:00:00Z',
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ─── Credential ──────────────────────────────────────────────────────────────

describe('lemlist credential', () => {
  it('defines credential metadata', () => {
    expect(lemlistCredential.name).toBe('lemlist')
    expect(lemlistCredential.displayName).toBe('Lemlist API Key')
    expect(lemlistCredential.type).toBe('apiKey')
    expect(lemlistCredential.authenticate.properties['Authorization']).toBe(
      'Basic {{apiKey}}',
    )
  })

  it('schema rejects empty apiKey', () => {
    const result = lemlistCredential.schema.safeParse({ apiKey: '' })
    expect(result.success).toBe(false)
  })

  it('schema accepts valid apiKey', () => {
    const result = lemlistCredential.schema.safeParse({ apiKey: 'abc123' })
    expect(result.success).toBe(true)
  })
})

// ─── Utils ───────────────────────────────────────────────────────────────────

describe('lemlist utils', () => {
  it('buildLemlistAuthHeader encodes empty-username basic auth', () => {
    const header = buildLemlistAuthHeader('abc123')
    expect(header.startsWith('Basic ')).toBe(true)
    const encoded = header.slice('Basic '.length)
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    expect(decoded).toBe(':abc123')
  })

  it('buildLemlistHeaders returns Authorization and Content-Type', () => {
    const headers = buildLemlistHeaders('key')
    expect(headers['Authorization']).toBeDefined()
    expect(headers['Authorization']!.startsWith('Basic ')).toBe(true)
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('LEMLIST_API_BASE is the documented base', () => {
    expect(LEMLIST_API_BASE).toBe('https://api.lemlist.com/api')
  })
})

// ─── lemlist_add_lead ────────────────────────────────────────────────────────

describe('lemlist_add_lead', () => {
  describe('schema', () => {
    it('accepts minimal input', () => {
      const result = LemlistAddLeadInputSchema.safeParse({
        campaignId: 'cam_X',
        email: 'jane@example.com',
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing campaignId', () => {
      const result = LemlistAddLeadInputSchema.safeParse({
        email: 'jane@example.com',
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid email', () => {
      const result = LemlistAddLeadInputSchema.safeParse({
        campaignId: 'cam_X',
        email: 'not-an-email',
      })
      expect(result.success).toBe(false)
    })
  })

  it('fails when API key is missing', async () => {
    const result = await lemlistAddLeadNode.executor(
      { campaignId: 'cam_X', email: 'jane@example.com' },
      mockContextNoCreds,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('lemlist.apiKey')
    }
  })

  it('sends correct POST with Basic auth and JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockLead, 200))
    vi.stubGlobal('fetch', fetchMock)

    const result = await lemlistAddLeadNode.executor(
      {
        campaignId: 'cam_xyz789',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      },
      mockContext,
    )

    expect(result.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${LEMLIST_API_BASE}/campaigns/cam_xyz789/leads/`)
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']!.startsWith('Basic ')).toBe(true)
    expect(headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(String(init.body))
    expect(body.email).toBe('jane@example.com')
    expect(body.firstName).toBe('Jane')
    expect(body.lastName).toBe('Doe')
  })

  it('omits undefined fields from request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockLead, 200))
    vi.stubGlobal('fetch', fetchMock)

    await lemlistAddLeadNode.executor(
      { campaignId: 'cam_xyz789', email: 'jane@example.com' },
      mockContext,
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(Object.keys(body).sort()).toEqual(['email'])
  })

  it('returns normalized lead on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(mockLead, 200)),
    )

    const result = await lemlistAddLeadNode.executor(
      { campaignId: 'cam_xyz789', email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?._id).toBe('lea_abc123')
      expect(result.output?.email).toBe('jane@example.com')
      expect(result.output?.campaignId).toBe('cam_xyz789')
    }
  })

  it('returns error on 422 validation failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('Unprocessable Entity', { status: 422 })),
    )

    const result = await lemlistAddLeadNode.executor(
      { campaignId: 'cam_X', email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('422')
    }
  })

  it('returns error on 401 unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    )

    const result = await lemlistAddLeadNode.executor(
      { campaignId: 'cam_X', email: 'jane@example.com' },
      mockContext,
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('401')
    }
  })
})

// ─── lemlist_get_campaigns ───────────────────────────────────────────────────

describe('lemlist_get_campaigns', () => {
  it('input schema rejects limit over 100', () => {
    const result = LemlistGetCampaignsInputSchema.safeParse({ limit: 101 })
    expect(result.success).toBe(false)
  })

  it('fails when API key is missing', async () => {
    const result = await lemlistGetCampaignsNode.executor(
      {},
      mockContextNoCreds,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('lemlist.apiKey')
    }
  })

  it('calls GET /campaigns with version=v2 by default', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse([mockCampaign], 200))
    vi.stubGlobal('fetch', fetchMock)

    const result = await lemlistGetCampaignsNode.executor({}, mockContext)
    expect(result.success).toBe(true)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${LEMLIST_API_BASE}/campaigns?`)
    expect(url).toContain('version=v2')
    expect(init.method).toBe('GET')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']!.startsWith('Basic ')).toBe(true)
  })

  it('passes limit, offset, and status query params when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([], 200))
    vi.stubGlobal('fetch', fetchMock)

    await lemlistGetCampaignsNode.executor(
      { limit: 50, offset: 10, status: 'running' },
      mockContext,
    )

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('limit=50')
    expect(url).toContain('offset=10')
    expect(url).toContain('status=running')
  })

  it('returns normalized campaigns with count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse([mockCampaign, mockCampaign], 200)),
    )

    const result = await lemlistGetCampaignsNode.executor({}, mockContext)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.campaigns).toHaveLength(2)
      expect(result.output?.count).toBe(2)
      expect(result.output?.campaigns[0]?._id).toBe('cam_xyz789')
      expect(result.output?.campaigns[0]?.status).toBe('running')
    }
  })

  it('returns empty array when no campaigns', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([], 200)))
    const result = await lemlistGetCampaignsNode.executor({}, mockContext)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.count).toBe(0)
      expect(result.output?.campaigns).toEqual([])
    }
  })

  it('returns error on non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('Server Error', { status: 500 })),
    )
    const result = await lemlistGetCampaignsNode.executor({}, mockContext)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/500|Server error/)
    }
  })
})

// ─── lemlist_get_activity ────────────────────────────────────────────────────

describe('lemlist_get_activity', () => {
  it('input schema rejects limit over 100', () => {
    const result = LemlistGetActivityInputSchema.safeParse({ limit: 500 })
    expect(result.success).toBe(false)
  })

  it('fails when API key is missing', async () => {
    const result = await lemlistGetActivityNode.executor({}, mockContextNoCreds)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('lemlist.apiKey')
    }
  })

  it('calls GET /activities with version=v2', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse([mockActivity], 200))
    vi.stubGlobal('fetch', fetchMock)

    await lemlistGetActivityNode.executor({}, mockContext)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${LEMLIST_API_BASE}/activities?`)
    expect(url).toContain('version=v2')
    expect(init.method).toBe('GET')
  })

  it('passes campaignId and type filters when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([], 200))
    vi.stubGlobal('fetch', fetchMock)

    await lemlistGetActivityNode.executor(
      { campaignId: 'cam_xyz789', type: 'emailOpened' },
      mockContext,
    )

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('campaignId=cam_xyz789')
    expect(url).toContain('type=emailOpened')
  })

  it('returns normalized activities with count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse([mockActivity], 200)),
    )

    const result = await lemlistGetActivityNode.executor({}, mockContext)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.count).toBe(1)
      expect(result.output?.activities[0]?._id).toBe('act_aaa')
      expect(result.output?.activities[0]?.type).toBe('emailOpened')
    }
  })

  it('handles empty activity array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([], 200)))
    const result = await lemlistGetActivityNode.executor({}, mockContext)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.count).toBe(0)
    }
  })

  it('returns error on non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Bad Request', { status: 400 })),
    )
    const result = await lemlistGetActivityNode.executor({}, mockContext)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('400')
    }
  })
})

// ─── lemlist_pause_lead ──────────────────────────────────────────────────────

describe('lemlist_pause_lead', () => {
  it('input schema requires leadId', () => {
    const result = LemlistPauseLeadInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('fails when API key is missing', async () => {
    const result = await lemlistPauseLeadNode.executor(
      { leadId: 'lea_abc123' },
      mockContextNoCreds,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('lemlist.apiKey')
    }
  })

  it('sends POST to /leads/pause/{leadId} without campaignId', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse([{ ...mockLead, isPaused: true }], 200),
      )
    vi.stubGlobal('fetch', fetchMock)

    await lemlistPauseLeadNode.executor(
      { leadId: 'lea_abc123' },
      mockContext,
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${LEMLIST_API_BASE}/leads/pause/lea_abc123`)
    expect(url).not.toContain('campaignId=')
    expect(init.method).toBe('POST')
  })

  it('sends POST with campaignId query param when provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse([{ ...mockLead, isPaused: true }], 200),
      )
    vi.stubGlobal('fetch', fetchMock)

    await lemlistPauseLeadNode.executor(
      { leadId: 'lea_abc123', campaignId: 'cam_xyz789' },
      mockContext,
    )

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('/leads/pause/lea_abc123')
    expect(url).toContain('campaignId=cam_xyz789')
  })

  it('returns normalized leads array with isPaused true', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse([{ ...mockLead, isPaused: true }], 200),
        ),
    )

    const result = await lemlistPauseLeadNode.executor(
      { leadId: 'lea_abc123' },
      mockContext,
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.leads).toHaveLength(1)
      expect(result.output?.leads[0]?.isPaused).toBe(true)
    }
  })

  it('URL-encodes special characters in leadId', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse([mockLead], 200))
    vi.stubGlobal('fetch', fetchMock)

    await lemlistPauseLeadNode.executor(
      { leadId: 'lea+tag/abc' },
      mockContext,
    )

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('lea%2Btag%2Fabc')
    expect(url).not.toContain('lea+tag/abc')
  })

  it('returns error on 404 lead not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
    )

    const result = await lemlistPauseLeadNode.executor(
      { leadId: 'missing' },
      mockContext,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('404')
    }
  })
})

// ─── lemlist_resume_lead ─────────────────────────────────────────────────────

describe('lemlist_resume_lead', () => {
  it('input schema requires leadId', () => {
    const result = LemlistResumeLeadInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('fails when API key is missing', async () => {
    const result = await lemlistResumeLeadNode.executor(
      { leadId: 'lea_abc123' },
      mockContextNoCreds,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('lemlist.apiKey')
    }
  })

  it('sends POST to /leads/start/{leadId}', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse([{ ...mockLead, isPaused: false }], 200),
      )
    vi.stubGlobal('fetch', fetchMock)

    await lemlistResumeLeadNode.executor(
      { leadId: 'lea_abc123' },
      mockContext,
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${LEMLIST_API_BASE}/leads/start/lea_abc123`)
    expect(init.method).toBe('POST')
  })

  it('sends campaignId query param when provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse([{ ...mockLead, isPaused: false }], 200),
      )
    vi.stubGlobal('fetch', fetchMock)

    await lemlistResumeLeadNode.executor(
      { leadId: 'lea_abc123', campaignId: 'cam_xyz789' },
      mockContext,
    )

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('/leads/start/lea_abc123')
    expect(url).toContain('campaignId=cam_xyz789')
  })

  it('returns normalized leads with isPaused false', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse([{ ...mockLead, isPaused: false }], 200),
        ),
    )

    const result = await lemlistResumeLeadNode.executor(
      { leadId: 'lea_abc123' },
      mockContext,
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?.leads[0]?.isPaused).toBe(false)
    }
  })

  it('URL-encodes special characters in leadId', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse([mockLead], 200))
    vi.stubGlobal('fetch', fetchMock)

    await lemlistResumeLeadNode.executor(
      { leadId: 'lea+tag/abc' },
      mockContext,
    )

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('lea%2Btag%2Fabc')
    expect(url).not.toContain('lea+tag/abc')
  })

  it('returns error on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
    )

    const result = await lemlistResumeLeadNode.executor(
      { leadId: 'missing' },
      mockContext,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('404')
    }
  })
})

// ─── lemlist_mark_as_interested ──────────────────────────────────────────────

describe('lemlist_mark_as_interested', () => {
  it('input schema requires both campaignId and leadIdOrEmail', () => {
    expect(
      LemlistMarkAsInterestedInputSchema.safeParse({ campaignId: 'cam_X' })
        .success,
    ).toBe(false)
    expect(
      LemlistMarkAsInterestedInputSchema.safeParse({
        leadIdOrEmail: 'jane@example.com',
      }).success,
    ).toBe(false)
  })

  it('fails when API key is missing', async () => {
    const result = await lemlistMarkAsInterestedNode.executor(
      { campaignId: 'cam_X', leadIdOrEmail: 'lea_abc123' },
      mockContextNoCreds,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('lemlist.apiKey')
    }
  })

  it('sends POST to /campaigns/{id}/leads/{leadIdOrEmail}/interested', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockLead, 200))
    vi.stubGlobal('fetch', fetchMock)

    await lemlistMarkAsInterestedNode.executor(
      { campaignId: 'cam_xyz789', leadIdOrEmail: 'lea_abc123' },
      mockContext,
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `${LEMLIST_API_BASE}/campaigns/cam_xyz789/leads/lea_abc123/interested`,
    )
    expect(init.method).toBe('POST')
  })

  it('URL-encodes email lead identifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mockLead, 200))
    vi.stubGlobal('fetch', fetchMock)

    await lemlistMarkAsInterestedNode.executor(
      { campaignId: 'cam_xyz789', leadIdOrEmail: 'support@lemlist.com' },
      mockContext,
    )

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('support%40lemlist.com')
    expect(url).toContain('/interested')
  })

  it('returns single normalized lead on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(mockLead, 200)),
    )

    const result = await lemlistMarkAsInterestedNode.executor(
      { campaignId: 'cam_xyz789', leadIdOrEmail: 'lea_abc123' },
      mockContext,
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output?._id).toBe('lea_abc123')
      expect(result.output?.email).toBe('jane@example.com')
    }
  })

  it('returns error on 404 campaign/lead not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
    )

    const result = await lemlistMarkAsInterestedNode.executor(
      { campaignId: 'cam_X', leadIdOrEmail: 'missing' },
      mockContext,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('404')
    }
  })

  it('returns error on 405 method not allowed', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('Method Not Allowed', { status: 405 })),
    )

    const result = await lemlistMarkAsInterestedNode.executor(
      { campaignId: 'cam_X', leadIdOrEmail: 'lea_X' },
      mockContext,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('405')
    }
  })
})

// ─── Package-level exports ────────────────────────────────────────────────────

describe('lemlist package exports', () => {
  it('exports all six lemlist nodes from package root', async () => {
    const pkg = await import('../../../index.js')
    expect(pkg.lemlistAddLeadNode.type).toBe('lemlist_add_lead')
    expect(pkg.lemlistGetCampaignsNode.type).toBe('lemlist_get_campaigns')
    expect(pkg.lemlistGetActivityNode.type).toBe('lemlist_get_activity')
    expect(pkg.lemlistPauseLeadNode.type).toBe('lemlist_pause_lead')
    expect(pkg.lemlistResumeLeadNode.type).toBe('lemlist_resume_lead')
    expect(pkg.lemlistMarkAsInterestedNode.type).toBe(
      'lemlist_mark_as_interested',
    )
  })

  it('exports lemlistCredential from package root', async () => {
    const pkg = await import('../../../index.js')
    expect(pkg.lemlistCredential.name).toBe('lemlist')
    expect(pkg.lemlistCredential.type).toBe('apiKey')
  })

  it('builtInNodes includes all six lemlist nodes', async () => {
    const pkg = await import('../../../index.js')
    const lemlistNodes = pkg.builtInNodes.filter((n) =>
      n.type.startsWith('lemlist_'),
    )
    expect(lemlistNodes).toHaveLength(6)
  })
})

// ─── Integration tests (cross-node assertions) ───────────────────────────────

describe('lemlist integration — end-to-end', () => {
  const allNodes = [
    {
      node: lemlistAddLeadNode,
      input: { campaignId: 'cam_X', email: 'jane@example.com' },
      successResponse: jsonResponse(mockLead, 200),
    },
    {
      node: lemlistGetCampaignsNode,
      input: {},
      successResponse: jsonResponse([mockCampaign], 200),
    },
    {
      node: lemlistGetActivityNode,
      input: {},
      successResponse: jsonResponse([mockActivity], 200),
    },
    {
      node: lemlistPauseLeadNode,
      input: { leadId: 'lea_abc123' },
      successResponse: jsonResponse([mockLead], 200),
    },
    {
      node: lemlistResumeLeadNode,
      input: { leadId: 'lea_abc123' },
      successResponse: jsonResponse([mockLead], 200),
    },
    {
      node: lemlistMarkAsInterestedNode,
      input: { campaignId: 'cam_X', leadIdOrEmail: 'lea_abc123' },
      successResponse: jsonResponse(mockLead, 200),
    },
  ]

  it('every node has integration category, supportsRerun, non-empty description, and lemlist_ type', () => {
    for (const { node } of allNodes) {
      expect(node.category).toBe('integration')
      expect(node.capabilities?.supportsRerun).toBe(true)
      expect(node.description.length).toBeGreaterThan(0)
      expect(node.type.startsWith('lemlist_')).toBe(true)
    }
    const types = allNodes.map((n) => n.node.type)
    expect(new Set(types).size).toBe(6)
  })

  it('every node fails identically when API key is missing', async () => {
    for (const { node, input } of allNodes) {
      const result = await node.executor(
        input as never,
        mockContextNoCreds,
      )
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('lemlist.apiKey')
      }
    }
  })

  it('every node sends a Basic Authorization header derived from the API key', async () => {
    for (const { node, input, successResponse } of allNodes) {
      const fetchMock = vi.fn().mockResolvedValue(successResponse.clone())
      vi.stubGlobal('fetch', fetchMock)

      await node.executor(input as never, mockContext)

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const headers = init.headers as Record<string, string>
      expect(headers['Authorization']).toBeDefined()
      expect(headers['Authorization']!.startsWith('Basic ')).toBe(true)
      const encoded = headers['Authorization']!.slice('Basic '.length)
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
      expect(decoded).toBe(':test-api-key')

      vi.unstubAllGlobals()
    }
  })

  it('every node retries on 429 then succeeds (proves fetchWithRetry is wired)', async () => {
    for (const { node, input, successResponse } of allNodes) {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('rate limited', {
            status: 429,
            headers: { 'retry-after': '0' },
          }),
        )
        .mockResolvedValueOnce(successResponse.clone())

      vi.stubGlobal('fetch', fetchMock)

      const result = await node.executor(input as never, mockContext)
      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(2)

      vi.unstubAllGlobals()
    }
  })
})
