import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sendgridCredential,
  sendgridSendEmailNode,
  sendgridCreateContactNode,
  sendgridGetContactsNode,
  SendgridSendEmailInputSchema,
  SendgridCreateContactInputSchema,
  SendgridGetContactsInputSchema,
} from '../index.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const makeCtx = (withCreds = true) => ({
  userId: 'u1',
  workflowExecutionId: 'w1',
  variables: {},
  resolveNestedPath: () => undefined,
  ...(withCreds ? { credentials: { sendgrid: { apiKey: 'SG.test' } } } : {}),
});

// ─── credentials ────────────────────────────────────────────────────────────

describe('sendgrid credentials', () => {
  it('defines apiKey credential metadata', () => {
    expect(sendgridCredential.name).toBe('sendgrid');
    expect(sendgridCredential.type).toBe('apiKey');
    expect(sendgridCredential.displayName).toBe('SendGrid API');
  });

  it('uses Bearer header interpolation', () => {
    expect(sendgridCredential.authenticate.type).toBe('header');
    expect(sendgridCredential.authenticate.properties.Authorization).toBe('Bearer {{apiKey}}');
  });

  it('rejects empty apiKey', () => {
    const result = sendgridCredential.schema.safeParse({ apiKey: '' });
    expect(result.success).toBe(false);
  });

  it('accepts valid apiKey', () => {
    const result = sendgridCredential.schema.safeParse({ apiKey: 'SG.xxx' });
    expect(result.success).toBe(true);
  });
});

// ─── schemas ────────────────────────────────────────────────────────────────

describe('sendgrid schemas', () => {
  it('validates send-email with single to', () => {
    const result = SendgridSendEmailInputSchema.safeParse({
      to: 'a@x.com',
      from: 'b@x.com',
      subject: 's',
      content: { type: 'text/html', value: '<p>hi</p>' },
    });
    expect(result.success).toBe(true);
  });

  it('validates send-email with to array', () => {
    const result = SendgridSendEmailInputSchema.safeParse({
      to: ['a@x.com', 'b@x.com'],
      from: 'c@x.com',
      subject: 's',
      content: { type: 'text/plain', value: 'hi' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects send-email missing subject', () => {
    const result = SendgridSendEmailInputSchema.safeParse({
      to: 'a@x.com',
      from: 'b@x.com',
      content: { type: 'text/plain', value: 'hi' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects send-email with non-email to', () => {
    const result = SendgridSendEmailInputSchema.safeParse({
      to: 'not-an-email',
      from: 'b@x.com',
      subject: 's',
      content: { type: 'text/plain', value: 'hi' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects send-email with empty to array', () => {
    const result = SendgridSendEmailInputSchema.safeParse({
      to: [],
      from: 'b@x.com',
      subject: 's',
      content: { type: 'text/plain', value: 'hi' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts send-email with template', () => {
    const result = SendgridSendEmailInputSchema.safeParse({
      to: 'a@x.com',
      from: 'b@x.com',
      subject: 's',
      content: { type: 'text/html', value: 'fallback' },
      templateId: 'd-abc',
      dynamicTemplateData: { name: 'Ada' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts send-email with attachments', () => {
    const result = SendgridSendEmailInputSchema.safeParse({
      to: 'a@x.com',
      from: 'b@x.com',
      subject: 's',
      content: { type: 'text/plain', value: 'hi' },
      attachments: [
        { content: 'SGVsbG8=', filename: 'hello.txt', type: 'text/plain' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates create-contact with only email', () => {
    const result = SendgridCreateContactInputSchema.safeParse({ email: 'a@x.com' });
    expect(result.success).toBe(true);
  });

  it('rejects create-contact with malformed email', () => {
    const result = SendgridCreateContactInputSchema.safeParse({ email: 'nope' });
    expect(result.success).toBe(false);
  });

  it('accepts empty get-contacts input (limit/offset are optional)', () => {
    const result = SendgridGetContactsInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects get-contacts with limit over 50', () => {
    const result = SendgridGetContactsInputSchema.safeParse({ limit: 500 });
    expect(result.success).toBe(false);
  });
});

// ─── sendgrid_send_email ────────────────────────────────────────────────────

describe('sendgrid_send_email', () => {
  const basicInput = {
    to: 'recipient@example.com',
    from: 'sender@example.com',
    subject: 'Hello',
    content: { type: 'text/html' as const, value: '<p>Hi</p>' },
  };

  const mockAccepted = (messageId: string | null = 'mid-123') => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (messageId !== null) headers['x-message-id'] = messageId;
    return vi.fn().mockResolvedValue(
      new Response(null, {
        status: 202,
        headers,
      })
    );
  };

  it('fails when API key is missing', async () => {
    const result = await sendgridSendEmailNode.executor(basicInput, makeCtx(false));
    expect(result.success).toBe(false);
    expect(result.error).toContain('sendgrid.apiKey');
  });

  it('sends basic email and returns messageId from header', async () => {
    const fetchMock = mockAccepted('mid-abc');
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendgridSendEmailNode.executor(basicInput, makeCtx());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.messageId).toBe('mid-abc');
      expect(result.output.status).toBe('sent');
    }

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer SG.test');
    const body = JSON.parse(String(init.body));
    expect(body.personalizations[0].to[0].email).toBe('recipient@example.com');
  });

  it('normalizes to array when given string', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridSendEmailNode.executor(basicInput, makeCtx());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.personalizations[0].to).toEqual([{ email: 'recipient@example.com' }]);
  });

  it('normalizes to array when given multiple recipients', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridSendEmailNode.executor(
      { ...basicInput, to: ['a@x.com', 'b@x.com'] },
      makeCtx()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.personalizations[0].to).toEqual([{ email: 'a@x.com' }, { email: 'b@x.com' }]);
  });

  it('includes templateId and dynamicTemplateData', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridSendEmailNode.executor(
      { ...basicInput, templateId: 'd-tmpl', dynamicTemplateData: { name: 'Ada' } },
      makeCtx()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.template_id).toBe('d-tmpl');
    expect(body.personalizations[0].dynamic_template_data.name).toBe('Ada');
    expect(body.content).toBeUndefined();
  });

  it('omits top-level content when templateId is provided', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridSendEmailNode.executor(
      {
        ...basicInput,
        templateId: 'd-tmpl',
        content: { type: 'text/html', value: '<p>fallback</p>' },
      },
      makeCtx()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.template_id).toBe('d-tmpl');
    expect(body.content).toBeUndefined();
  });

  it('includes top-level content when templateId is absent', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridSendEmailNode.executor(basicInput, makeCtx());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.content).toEqual([{ type: 'text/html', value: '<p>Hi</p>' }]);
    expect(body.template_id).toBeUndefined();
  });

  it('passes attachments verbatim', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridSendEmailNode.executor(
      {
        ...basicInput,
        attachments: [
          { content: 'SGVsbG8=', filename: 'hello.txt', type: 'text/plain' },
        ],
      },
      makeCtx()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].filename).toBe('hello.txt');
    expect(body.attachments[0].content).toBe('SGVsbG8=');
    expect(body.attachments[0].type).toBe('text/plain');
  });

  it('sets status to scheduled when sendAt provided', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendgridSendEmailNode.executor(
      { ...basicInput, sendAt: 1699999999 },
      makeCtx()
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.output.status).toBe('scheduled');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.send_at).toBe(1699999999);
  });

  it('includes cc, bcc, replyTo when provided', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridSendEmailNode.executor(
      { ...basicInput, cc: ['cc@x.com'], bcc: ['bcc@x.com'], replyTo: 'reply@x.com' },
      makeCtx()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.personalizations[0].cc).toEqual([{ email: 'cc@x.com' }]);
    expect(body.personalizations[0].bcc).toEqual([{ email: 'bcc@x.com' }]);
    expect(body.reply_to).toEqual({ email: 'reply@x.com' });
  });

  it('returns error on non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"errors":[{"message":"bad from"}]}', {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendgridSendEmailNode.executor(basicInput, makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain('400');
  });

  it('handles empty x-message-id header gracefully', async () => {
    const fetchMock = mockAccepted(null);
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendgridSendEmailNode.executor(basicInput, makeCtx());
    expect(result.success).toBe(true);
    if (result.success) expect(result.output.messageId).toBe('');
  });

  it('handles 401 Unauthorized from SendGrid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('unauthorized', { status: 401 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendgridSendEmailNode.executor(basicInput, makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });
});

// ─── sendgrid_create_contact ────────────────────────────────────────────────

describe('sendgrid_create_contact', () => {
  const basicInput = { email: 'contact@example.com' };

  const mockAccepted = (body: unknown = { job_id: 'job-1' }) =>
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    );

  it('fails when API key is missing', async () => {
    const result = await sendgridCreateContactNode.executor(basicInput, makeCtx(false));
    expect(result.success).toBe(false);
    expect(result.error).toContain('sendgrid.apiKey');
  });

  it('upserts contact and returns job id', async () => {
    vi.stubGlobal('fetch', mockAccepted({ job_id: 'job-abc' }));
    const result = await sendgridCreateContactNode.executor(basicInput, makeCtx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.contactJobId).toBe('job-abc');
      expect(result.output.status).toBe('queued');
      expect(result.output.email).toBe('contact@example.com');
    }
  });

  it('sends PUT and correct body', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridCreateContactNode.executor(
      { email: 'x@y.com', firstName: 'Ada', lastName: 'Lovelace' },
      makeCtx()
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sendgrid.com/v3/marketing/contacts');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(String(init.body));
    expect(body.contacts[0].email).toBe('x@y.com');
    expect(body.contacts[0].first_name).toBe('Ada');
    expect(body.contacts[0].last_name).toBe('Lovelace');
  });

  it('passes listIds through as list_ids', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridCreateContactNode.executor(
      { ...basicInput, listIds: ['l1', 'l2'] },
      makeCtx()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.list_ids).toEqual(['l1', 'l2']);
  });

  it('omits list_ids when not provided', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridCreateContactNode.executor(basicInput, makeCtx());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.list_ids).toBeUndefined();
  });

  it('omits list_ids when provided as empty array', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridCreateContactNode.executor(
      { ...basicInput, listIds: [] },
      makeCtx()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.list_ids).toBeUndefined();
  });

  it('passes customFields through as custom_fields', async () => {
    const fetchMock = mockAccepted();
    vi.stubGlobal('fetch', fetchMock);
    await sendgridCreateContactNode.executor(
      { ...basicInput, customFields: { region: 'NA' } },
      makeCtx()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.contacts[0].custom_fields.region).toBe('NA');
  });

  it('returns error on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('bad request', { status: 400 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendgridCreateContactNode.executor(basicInput, makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain('400');
  });

  it('returns error when response body has no job_id', async () => {
    vi.stubGlobal('fetch', mockAccepted({}));
    const result = await sendgridCreateContactNode.executor(basicInput, makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain('job_id');
  });
});

// ─── sendgrid_get_contacts ──────────────────────────────────────────────────

describe('sendgrid_get_contacts', () => {
  const mockResult = (body: unknown) =>
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

  const makeContact = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    email: `${id}@x.com`,
    first_name: 'First',
    last_name: 'Last',
    list_ids: ['L1'],
    ...overrides,
  });

  it('fails when API key is missing', async () => {
    const result = await sendgridGetContactsNode.executor(
      { limit: 50, offset: 0 },
      makeCtx(false)
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('sendgrid.apiKey');
  });

  it('fetches contacts and maps fields', async () => {
    vi.stubGlobal(
      'fetch',
      mockResult({
        result: [
          {
            id: 'c1',
            email: 'a@x.com',
            first_name: 'Ada',
            last_name: 'L',
            list_ids: ['L1'],
          },
        ],
        contact_count: 1,
      })
    );
    const result = await sendgridGetContactsNode.executor(
      { limit: 50, offset: 0 },
      makeCtx()
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.contacts).toHaveLength(1);
      expect(result.output.contacts[0]?.firstName).toBe('Ada');
      expect(result.output.contacts[0]?.listIds[0]).toBe('L1');
      expect(result.output.total).toBe(1);
    }
  });

  it('sends empty query when listId omitted', async () => {
    const fetchMock = mockResult({ result: [], contact_count: 0 });
    vi.stubGlobal('fetch', fetchMock);
    await sendgridGetContactsNode.executor({ limit: 50, offset: 0 }, makeCtx());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sendgrid.com/v3/marketing/contacts/search');
    const body = JSON.parse(String(init.body));
    expect(body.query).toBe('');
  });

  it('builds SGQL list filter when listId provided', async () => {
    const fetchMock = mockResult({ result: [], contact_count: 0 });
    vi.stubGlobal('fetch', fetchMock);
    await sendgridGetContactsNode.executor(
      { listId: 'list-42', limit: 50, offset: 0 },
      makeCtx()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.query).toBe("CONTAINS(list_ids, 'list-42')");
  });

  it('escapes single quotes in listId', async () => {
    const fetchMock = mockResult({ result: [], contact_count: 0 });
    vi.stubGlobal('fetch', fetchMock);
    await sendgridGetContactsNode.executor(
      { listId: "o'brien", limit: 50, offset: 0 },
      makeCtx()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.query).toBe("CONTAINS(list_ids, 'o\\'brien')");
  });

  it('applies limit client-side', async () => {
    vi.stubGlobal(
      'fetch',
      mockResult({
        result: [
          makeContact('c1'),
          makeContact('c2'),
          makeContact('c3'),
          makeContact('c4'),
          makeContact('c5'),
        ],
        contact_count: 5,
      })
    );
    const result = await sendgridGetContactsNode.executor(
      { limit: 2, offset: 0 },
      makeCtx()
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.contacts).toHaveLength(2);
      expect(result.output.total).toBe(5);
    }
  });

  it('applies offset client-side', async () => {
    vi.stubGlobal(
      'fetch',
      mockResult({
        result: [
          makeContact('c1'),
          makeContact('c2'),
          makeContact('c3'),
          makeContact('c4'),
          makeContact('c5'),
        ],
        contact_count: 5,
      })
    );
    const result = await sendgridGetContactsNode.executor(
      { limit: 2, offset: 2 },
      makeCtx()
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.contacts[0]?.id).toBe('c3');
    }
  });

  it('handles null first_name / last_name in response', async () => {
    vi.stubGlobal(
      'fetch',
      mockResult({
        result: [
          {
            id: 'c1',
            email: 'a@x.com',
            first_name: null,
            last_name: null,
            list_ids: [],
          },
        ],
        contact_count: 1,
      })
    );
    const result = await sendgridGetContactsNode.executor(
      { limit: 50, offset: 0 },
      makeCtx()
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.contacts[0]?.firstName).toBeNull();
      expect(result.output.contacts[0]?.lastName).toBeNull();
    }
  });

  it('returns error on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('server error', { status: 500 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendgridGetContactsNode.executor(
      { limit: 50, offset: 0 },
      makeCtx()
    );
    expect(result.success).toBe(false);
  });

  it('handles empty results', async () => {
    vi.stubGlobal('fetch', mockResult({ result: [], contact_count: 0 }));
    const result = await sendgridGetContactsNode.executor(
      { limit: 50, offset: 0 },
      makeCtx()
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.contacts).toHaveLength(0);
      expect(result.output.total).toBe(0);
    }
  });

  it('executor applies default limit=50 and offset=0 when omitted', async () => {
    const five = [
      makeContact('c1'),
      makeContact('c2'),
      makeContact('c3'),
      makeContact('c4'),
      makeContact('c5'),
    ];
    vi.stubGlobal('fetch', mockResult({ result: five, contact_count: 5 }));
    const result = await sendgridGetContactsNode.executor({}, makeCtx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.contacts).toHaveLength(5);
      expect(result.output.contacts[0]?.id).toBe('c1');
      expect(result.output.total).toBe(5);
    }
  });
});
