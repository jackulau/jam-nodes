import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  instantlyCredential,
  instantlyAddLeadNode,
  instantlyCreateCampaignNode,
  instantlyGetAnalyticsNode,
  InstantlyAddLeadInputSchema,
  InstantlyCreateCampaignInputSchema,
  InstantlyGetAnalyticsInputSchema,
  SequenceStepSchema,
} from './index.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const makeContext = (credentials?: Record<string, unknown>) => ({
  userId: 'u1',
  workflowExecutionId: 'w1',
  variables: {},
  resolveNestedPath: () => undefined,
  credentials,
});

const makeJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const makeErrorResponse = (status: number, text = 'error body') =>
  new Response(text, { status });

// =============================================================================
// Credential
// =============================================================================

describe('instantly credential', () => {
  it('defines bearer credential metadata', () => {
    expect(instantlyCredential.name).toBe('instantly');
    expect(instantlyCredential.type).toBe('bearer');
    expect(instantlyCredential.authenticate.properties.Authorization).toBe(
      'Bearer {{apiKey}}'
    );
  });

  it('credential schema parses a valid apiKey', () => {
    const result = instantlyCredential.schema.safeParse({ apiKey: 'ins_abc123' });
    expect(result.success).toBe(true);
  });

  it('credential schema rejects missing apiKey', () => {
    const result = instantlyCredential.schema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Schemas
// =============================================================================

describe('instantly schemas', () => {
  it('validates add lead input with required fields only', () => {
    const result = InstantlyAddLeadInputSchema.safeParse({
      campaignId: 'camp_123',
      email: 'user@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('validates add lead input with all optional fields populated', () => {
    const result = InstantlyAddLeadInputSchema.safeParse({
      campaignId: 'camp_123',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      companyName: 'Analytical Engines Inc',
      personalization: 'Loved your talk on difference engines',
      customVariables: { tier: 'gold', signupYear: 1843 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects add lead input with invalid email', () => {
    const result = InstantlyAddLeadInputSchema.safeParse({
      campaignId: 'camp_123',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects add lead input with empty campaignId', () => {
    const result = InstantlyAddLeadInputSchema.safeParse({
      campaignId: '',
      email: 'user@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('validates create campaign with multi-step sequence', () => {
    const result = InstantlyCreateCampaignInputSchema.safeParse({
      name: 'Q2 Outreach',
      emailAccounts: ['sender1@ex.com', 'sender2@ex.com'],
      sequence: [
        { subject: 'Hi there', body: 'First touch', delayDays: 0 },
        { subject: 'Following up', body: 'Second touch', delayDays: 3 },
        { subject: 'Last try', body: 'Final touch', delayDays: 7 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects create campaign with empty sequence array', () => {
    const result = InstantlyCreateCampaignInputSchema.safeParse({
      name: 'Broken',
      emailAccounts: ['a@b.com'],
      sequence: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects create campaign with empty emailAccounts array', () => {
    const result = InstantlyCreateCampaignInputSchema.safeParse({
      name: 'Broken',
      emailAccounts: [],
      sequence: [{ subject: 'Hi', body: 'Body', delayDays: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects sequence step with negative delayDays', () => {
    const result = SequenceStepSchema.safeParse({
      subject: 'Hi',
      body: 'Body',
      delayDays: -1,
    });
    expect(result.success).toBe(false);
  });

  it('validates get analytics input', () => {
    const result = InstantlyGetAnalyticsInputSchema.safeParse({ campaignId: 'camp_123' });
    expect(result.success).toBe(true);
  });

  it('rejects get analytics with empty campaignId', () => {
    const result = InstantlyGetAnalyticsInputSchema.safeParse({ campaignId: '' });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// instantly_add_lead
// =============================================================================

describe('instantly_add_lead', () => {
  it('fails when api key is missing', async () => {
    const result = await instantlyAddLeadNode.executor(
      { campaignId: 'camp_123', email: 'user@example.com' },
      makeContext()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('instantly.apiKey');
  });

  it('adds lead and returns leadId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({ success: true, leadId: 'lead_789' })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyAddLeadNode.executor(
      { campaignId: 'camp_123', email: 'user@example.com' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(true);
    expect(result.output?.leadId).toBe('lead_789');
    expect(result.output?.campaignId).toBe('camp_123');
    expect(result.output?.email).toBe('user@example.com');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.instantly.ai/api/v1/leads');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test_key');
    expect(init.method).toBe('POST');
  });

  it('includes optional fields in request body when provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeJsonResponse({ success: true, leadId: 'lead_1' }));
    vi.stubGlobal('fetch', fetchMock);

    await instantlyAddLeadNode.executor(
      {
        campaignId: 'camp_123',
        email: 'user@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        companyName: 'Acme',
        personalization: 'hello',
        customVariables: { tier: 'gold' },
      },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.firstName).toBe('Ada');
    expect(body.lastName).toBe('Lovelace');
    expect(body.companyName).toBe('Acme');
    expect(body.personalization).toBe('hello');
    expect(body.customVariables).toEqual({ tier: 'gold' });
  });

  it('omits optional fields from request body when undefined', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeJsonResponse({ success: true, leadId: 'lead_1' }));
    vi.stubGlobal('fetch', fetchMock);

    await instantlyAddLeadNode.executor(
      { campaignId: 'camp_123', email: 'user@example.com' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ campaignId: 'camp_123', email: 'user@example.com' });
    expect(body.firstName).toBeUndefined();
    expect(body.customVariables).toBeUndefined();
  });

  it('returns failure on 4xx API response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeErrorResponse(400, 'invalid_campaign'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyAddLeadNode.executor(
      { campaignId: 'bad', email: 'user@example.com' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('400');
    expect(result.error).toContain('invalid_campaign');
  });

  it('truncates oversized error response text to 500 chars', async () => {
    const huge = 'x'.repeat(5000);
    const fetchMock = vi.fn().mockResolvedValue(makeErrorResponse(400, huge));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyAddLeadNode.executor(
      { campaignId: 'camp_123', email: 'user@example.com' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(false);
    // The prefix is "Instantly API error 400: " (25 chars) + truncated body (500 chars) = 525 total
    expect(result.error!.length).toBeLessThanOrEqual(600);
    expect(result.error!.length).toBeGreaterThanOrEqual(500);
    // Original body was 5000 'x's — confirm truncation really happened
    expect((result.error!.match(/x/g) ?? []).length).toBe(500);
  });

  it('falls back to data.id when data.leadId is absent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeJsonResponse({ id: 'fallback_id' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyAddLeadNode.executor(
      { campaignId: 'camp_123', email: 'user@example.com' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(true);
    expect(result.output?.leadId).toBe('fallback_id');
  });

  it('returns failure when response body says success: false', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeJsonResponse({ success: false, error: 'duplicate_email' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyAddLeadNode.executor(
      { campaignId: 'camp_123', email: 'dup@example.com' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('duplicate_email');
  });

  it('returns failure when fetch throws (network error)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = instantlyAddLeadNode.executor(
      { campaignId: 'camp_123', email: 'user@example.com' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =============================================================================
// instantly_create_campaign
// =============================================================================

describe('instantly_create_campaign', () => {
  const validInput = {
    name: 'Q2 Outreach',
    emailAccounts: ['sender@ex.com'],
    sequence: [
      { subject: 'Hi', body: 'First touch', delayDays: 0 },
      { subject: 'Follow-up', body: 'Second touch', delayDays: 3 },
    ],
  };

  it('fails when api key is missing', async () => {
    const result = await instantlyCreateCampaignNode.executor(validInput, makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain('instantly.apiKey');
  });

  it('creates campaign and returns campaignId with counts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeJsonResponse({ success: true, campaignId: 'camp_new' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyCreateCampaignNode.executor(
      validInput,
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(true);
    expect(result.output?.campaignId).toBe('camp_new');
    expect(result.output?.name).toBe('Q2 Outreach');
    expect(result.output?.emailAccountCount).toBe(1);
    expect(result.output?.sequenceStepCount).toBe(2);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.instantly.ai/api/v1/campaigns');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test_key');

    const body = JSON.parse(String(init.body));
    expect(body.name).toBe('Q2 Outreach');
    expect(body.emailAccounts).toEqual(['sender@ex.com']);
    expect(body.sequence).toHaveLength(2);
    expect(body.sequence[0]).toEqual({ subject: 'Hi', body: 'First touch', delayDays: 0 });
    expect(body.sequence[1]).toEqual({
      subject: 'Follow-up',
      body: 'Second touch',
      delayDays: 3,
    });
  });

  it('returns failure on 4xx API response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeErrorResponse(422, 'validation_failed'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyCreateCampaignNode.executor(
      validInput,
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('422');
    expect(result.error).toContain('validation_failed');
  });

  it('falls back to data.id when data.campaignId is absent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeJsonResponse({ id: 'fallback_camp' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyCreateCampaignNode.executor(
      validInput,
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(true);
    expect(result.output?.campaignId).toBe('fallback_camp');
  });

  it('returns failure when response body says success: false', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeJsonResponse({ success: false, error: 'account_not_verified' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyCreateCampaignNode.executor(
      validInput,
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('account_not_verified');
  });

  it('returns failure when fetch throws (network error)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = instantlyCreateCampaignNode.executor(
      validInput,
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =============================================================================
// instantly_get_analytics
// =============================================================================

describe('instantly_get_analytics', () => {
  it('fails when api key is missing', async () => {
    const result = await instantlyGetAnalyticsNode.executor(
      { campaignId: 'camp_123' },
      makeContext()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('instantly.apiKey');
  });

  it('returns all analytics metrics', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({
        sent: 100,
        opened: 50,
        clicked: 25,
        replied: 10,
        bounced: 5,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyGetAnalyticsNode.executor(
      { campaignId: 'camp_123' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      campaignId: 'camp_123',
      sent: 100,
      opened: 50,
      clicked: 25,
      replied: 10,
      bounced: 5,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.instantly.ai/api/v1/analytics/campaigns/camp_123');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test_key');
  });

  it('defaults all analytics metrics to 0 when API response omits them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyGetAnalyticsNode.executor(
      { campaignId: 'camp_empty' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      campaignId: 'camp_empty',
      sent: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
    });
  });

  it('url-encodes campaignId with special characters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({ sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await instantlyGetAnalyticsNode.executor(
      { campaignId: 'camp/with spaces' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      'https://api.instantly.ai/api/v1/analytics/campaigns/camp%2Fwith%20spaces'
    );
  });

  it('returns failure on 4xx API response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeErrorResponse(404, 'campaign_not_found'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await instantlyGetAnalyticsNode.executor(
      { campaignId: 'nope' },
      makeContext({ instantly: { apiKey: 'test_key' } })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
    expect(result.error).toContain('campaign_not_found');
  });
});
