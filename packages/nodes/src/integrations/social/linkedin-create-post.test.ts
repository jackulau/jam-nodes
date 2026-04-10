import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  linkedinCredential,
  linkedinCreatePostNode,
  LinkedInCreatePostInputSchema,
} from './index.js';

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

const withCredentials = {
  ...baseContext,
  credentials: { linkedin: { accessToken: 'li_token' } },
};

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function ugcPostsResponse(postUrn: string | null): Response {
  const headers: Record<string, string> = {};
  if (postUrn !== null) {
    headers['x-restli-id'] = postUrn;
  }
  return new Response(null, {
    status: 201,
    headers,
  });
}

// ─── Credential metadata ──────────────────────────────────────────────────────

describe('linkedin credential', () => {
  it('defines oauth2 credential metadata', () => {
    expect(linkedinCredential.name).toBe('linkedin');
    expect(linkedinCredential.type).toBe('oauth2');
    expect(linkedinCredential.config.authorizationUrl).toBe(
      'https://www.linkedin.com/oauth/v2/authorization'
    );
    expect(linkedinCredential.config.tokenUrl).toBe(
      'https://www.linkedin.com/oauth/v2/accessToken'
    );
  });

  it('includes required scopes', () => {
    const scopes = linkedinCredential.config.scopes;
    expect(scopes).toContain('r_liteprofile');
    expect(scopes).toContain('r_emailaddress');
    expect(scopes).toContain('w_member_social');
    expect(scopes).toContain('r_organization_social');
    expect(scopes).toContain('w_organization_social');
  });

  it('schema accepts required credentials', () => {
    const result = linkedinCredential.schema.safeParse({
      clientId: 'c',
      clientSecret: 's',
      accessToken: 't',
      expiresAt: 123456,
    });
    expect(result.success).toBe(true);
  });

  it('schema accepts full credentials with optional refreshToken', () => {
    const result = linkedinCredential.schema.safeParse({
      clientId: 'c',
      clientSecret: 's',
      accessToken: 't',
      refreshToken: 'r',
      expiresAt: 123456,
    });
    expect(result.success).toBe(true);
  });

  it('schema rejects credentials missing expiresAt', () => {
    const result = linkedinCredential.schema.safeParse({
      clientId: 'c',
      clientSecret: 's',
      accessToken: 't',
    });
    expect(result.success).toBe(false);
  });
});

// ─── Schema validation ────────────────────────────────────────────────────────

describe('LinkedInCreatePostInputSchema', () => {
  const validBase = {
    text: 'hello',
    visibility: 'PUBLIC' as const,
    postAs: 'person' as const,
  };

  it('accepts minimal valid input', () => {
    const result = LinkedInCreatePostInputSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('rejects missing required text', () => {
    const result = LinkedInCreatePostInputSchema.safeParse({
      visibility: 'PUBLIC',
      postAs: 'person',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid visibility value', () => {
    const result = LinkedInCreatePostInputSchema.safeParse({
      ...validBase,
      visibility: 'PRIVATE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid postAs value', () => {
    const result = LinkedInCreatePostInputSchema.safeParse({
      ...validBase,
      postAs: 'bot',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid mediaCategory values', () => {
    for (const mediaCategory of ['NONE', 'IMAGE', 'ARTICLE'] as const) {
      const result = LinkedInCreatePostInputSchema.safeParse({ ...validBase, mediaCategory });
      expect(result.success).toBe(true);
    }
  });

  it('accepts input with mediaCategory omitted', () => {
    const result = LinkedInCreatePostInputSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mediaCategory).toBeUndefined();
    }
  });
});

// ─── Credential & auth errors ─────────────────────────────────────────────────

describe('linkedin_create_post — credential & auth errors', () => {
  it('fails when access token is missing', async () => {
    const result = await linkedinCreatePostNode.executor(
      { text: 'hello', visibility: 'PUBLIC', postAs: 'person', mediaCategory: 'NONE' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('context.credentials.linkedin.accessToken');
  });

  it('returns error when /v2/me fails for person post with 422', async () => {
    // 422 is a client error that does NOT trigger fetchWithRetry's auth/server
    // paths, so the response is returned and our linkedInRequest wrapper's
    // non-OK handler produces the "LinkedIn API error: ..." message.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'bad profile request' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      { text: 'hello', visibility: 'PUBLIC', postAs: 'person', mediaCategory: 'NONE' },
      withCredentials
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('LinkedIn API error');
    expect(result.error).toContain('bad profile request');
  });

  it('returns error when /v2/me fails for person post with 401 (auth error from fetchWithRetry)', async () => {
    // 401 is handled specially by fetchWithRetry, which throws "Authentication error: ..."
    // before our wrapper sees it.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      { text: 'hello', visibility: 'PUBLIC', postAs: 'person', mediaCategory: 'NONE' },
      withCredentials
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication error');
  });

  it('fails when postAs is organization but organizationId is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'hello',
        visibility: 'PUBLIC',
        postAs: 'organization',
        mediaCategory: 'NONE',
      },
      withCredentials
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('organizationId is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── Text-only (NONE) paths ───────────────────────────────────────────────────

describe('linkedin_create_post — NONE media category', () => {
  it('creates text post as person', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(ugcPostsResponse('urn:li:share:123'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'hello world',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'NONE',
      },
      withCredentials
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      postId: 'urn:li:share:123',
      author: 'urn:li:person:abc',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [meUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(meUrl).toBe('https://api.linkedin.com/v2/me');

    const [postsUrl, postsInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(postsUrl).toBe('https://api.linkedin.com/v2/ugcPosts');
    expect(postsInit.method).toBe('POST');
    const postsHeaders = postsInit.headers as Record<string, string>;
    expect(postsHeaders['X-Restli-Protocol-Version']).toBe('2.0.0');
    expect(postsHeaders.Authorization).toBe('Bearer li_token');

    const body = JSON.parse(String(postsInit.body));
    expect(body.author).toBe('urn:li:person:abc');
    expect(body.lifecycleState).toBe('PUBLISHED');
    expect(body.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory).toBe('NONE');
    expect(body.specificContent['com.linkedin.ugc.ShareContent'].shareCommentary.text).toBe(
      'hello world'
    );
    expect(body.specificContent['com.linkedin.ugc.ShareContent'].media).toBeUndefined();
    expect(body.visibility['com.linkedin.ugc.MemberNetworkVisibility']).toBe('PUBLIC');
  });

  it('creates text post as organization (no /v2/me call)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ugcPostsResponse('urn:li:share:org1'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'company update',
        visibility: 'CONNECTIONS',
        postAs: 'organization',
        organizationId: '987654',
        mediaCategory: 'NONE',
      },
      withCredentials
    );

    expect(result.success).toBe(true);
    expect(result.output?.author).toBe('urn:li:organization:987654');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.linkedin.com/v2/ugcPosts');
    const body = JSON.parse(String(init.body));
    expect(body.author).toBe('urn:li:organization:987654');
    expect(body.visibility['com.linkedin.ugc.MemberNetworkVisibility']).toBe('CONNECTIONS');
  });

  it('silently ignores organizationId when postAs is person', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(ugcPostsResponse('urn:li:share:x'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'hi',
        visibility: 'PUBLIC',
        postAs: 'person',
        organizationId: 'should-be-ignored',
        mediaCategory: 'NONE',
      },
      withCredentials
    );

    expect(result.success).toBe(true);
    expect(result.output?.author).toBe('urn:li:person:abc');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://api.linkedin.com/v2/me');
  });

  it('NONE with extra imageUrl and articleUrl ignores them', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(ugcPostsResponse('urn:li:share:plain'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'just text',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'NONE',
        imageUrl: 'https://example.com/img.png',
        articleUrl: 'https://example.com/article',
      },
      withCredentials
    );

    expect(result.success).toBe(true);
    const [, postsInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(postsInit.body));
    expect(body.specificContent['com.linkedin.ugc.ShareContent'].media).toBeUndefined();
  });
});

// ─── ARTICLE paths ────────────────────────────────────────────────────────────

describe('linkedin_create_post — ARTICLE media category', () => {
  it('creates ARTICLE post with all optional fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(ugcPostsResponse('urn:li:share:art1'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'Check this out',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'ARTICLE',
        articleUrl: 'https://example.com/post',
        articleTitle: 'My Article',
        articleDescription: 'A great read',
      },
      withCredentials
    );

    expect(result.success).toBe(true);
    const [, postsInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(postsInit.body));
    const share = body.specificContent['com.linkedin.ugc.ShareContent'];
    expect(share.shareMediaCategory).toBe('ARTICLE');
    expect(share.media).toHaveLength(1);
    expect(share.media[0]).toEqual({
      status: 'READY',
      originalUrl: 'https://example.com/post',
      title: { text: 'My Article' },
      description: { text: 'A great read' },
    });
  });

  it('creates ARTICLE post without title or description', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(ugcPostsResponse('urn:li:share:art2'));
    vi.stubGlobal('fetch', fetchMock);

    await linkedinCreatePostNode.executor(
      {
        text: 'check this',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'ARTICLE',
        articleUrl: 'https://example.com/post',
      },
      withCredentials
    );

    const [, postsInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(postsInit.body));
    const media = body.specificContent['com.linkedin.ugc.ShareContent'].media[0];
    expect(media.originalUrl).toBe('https://example.com/post');
    expect(media.title).toBeUndefined();
    expect(media.description).toBeUndefined();
  });

  it('fails when mediaCategory is ARTICLE but articleUrl is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'abc' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'hi',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'ARTICLE',
      },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('articleUrl is required');
  });
});

// ─── IMAGE — pre-registered URN ───────────────────────────────────────────────

describe('linkedin_create_post — IMAGE with pre-registered URN', () => {
  it('creates IMAGE post using pre-registered URN (2 fetches, no upload)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(ugcPostsResponse('urn:li:share:img1'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'with image',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: 'urn:li:digitalmediaAsset:abc123',
      },
      withCredentials
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, postsInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(postsInit.body));
    const share = body.specificContent['com.linkedin.ugc.ShareContent'];
    expect(share.shareMediaCategory).toBe('IMAGE');
    expect(share.media).toHaveLength(1);
    expect(share.media[0].media).toBe('urn:li:digitalmediaAsset:abc123');
  });

  it('URN detection is case-insensitive', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(ugcPostsResponse('urn:li:share:img2'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'mixed case urn',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: 'URN:LI:digitalMediaAsset:abc',
      },
      withCredentials
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, postsInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(postsInit.body));
    expect(
      body.specificContent['com.linkedin.ugc.ShareContent'].media[0].media
    ).toBe('URN:LI:digitalMediaAsset:abc');
  });

  it('URN detection trims whitespace', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(ugcPostsResponse('urn:li:share:img3'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'padded urn',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: '  urn:li:digitalmediaAsset:abc  ',
      },
      withCredentials
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, postsInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(postsInit.body));
    expect(
      body.specificContent['com.linkedin.ugc.ShareContent'].media[0].media
    ).toBe('urn:li:digitalmediaAsset:abc');
  });
});

// ─── IMAGE — full upload flow ─────────────────────────────────────────────────

describe('linkedin_create_post — IMAGE with URL upload flow', () => {
  function mockImageDownload(): Response {
    // vitest's Response supports arrayBuffer() from a Uint8Array body
    return new Response(new Uint8Array([1, 2, 3, 4]).buffer, {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    });
  }

  function mockRegisterResponse(): Response {
    return jsonResponse({
      value: {
        asset: 'urn:li:digitalmediaAsset:uploaded-xyz',
        uploadMechanism: {
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
            uploadUrl: 'https://api.linkedin.com/mediaUpload/xyz',
          },
        },
      },
    });
  }

  it('creates IMAGE post with URL upload flow (person, 5 fetches)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(mockImageDownload())
      .mockResolvedValueOnce(mockRegisterResponse())
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(ugcPostsResponse('urn:li:share:upload1'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'my photo',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: 'https://example.com/photo.png',
      },
      withCredentials
    );

    expect(result.success).toBe(true);
    expect(result.output?.postId).toBe('urn:li:share:upload1');
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // Call 0: /v2/me
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://api.linkedin.com/v2/me');
    // Call 1: image download from original URL
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe('https://example.com/photo.png');
    // Call 2: register upload
    expect((fetchMock.mock.calls[2] as [string])[0]).toBe(
      'https://api.linkedin.com/v2/assets?action=registerUpload'
    );
    // Call 3: PUT binary
    const putCall = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(putCall[0]).toBe('https://api.linkedin.com/mediaUpload/xyz');
    expect(putCall[1].method).toBe('PUT');
    // Call 4: ugcPosts
    expect((fetchMock.mock.calls[4] as [string])[0]).toBe('https://api.linkedin.com/v2/ugcPosts');

    const [, postsInit] = fetchMock.mock.calls[4] as [string, RequestInit];
    const body = JSON.parse(String(postsInit.body));
    expect(
      body.specificContent['com.linkedin.ugc.ShareContent'].media[0].media
    ).toBe('urn:li:digitalmediaAsset:uploaded-xyz');
  });

  it('creates IMAGE post with URL upload flow (organization, 4 fetches)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockImageDownload())
      .mockResolvedValueOnce(mockRegisterResponse())
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(ugcPostsResponse('urn:li:share:org-upload'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'company photo',
        visibility: 'CONNECTIONS',
        postAs: 'organization',
        organizationId: 'org-42',
        mediaCategory: 'IMAGE',
        imageUrl: 'https://example.com/photo.png',
      },
      withCredentials
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.output?.author).toBe('urn:li:organization:org-42');
  });
});

// ─── IMAGE — failure modes ────────────────────────────────────────────────────

describe('linkedin_create_post — IMAGE failure modes', () => {
  function fetchMeOk(): Response {
    return jsonResponse({ id: 'abc' });
  }

  it('fails when mediaCategory is IMAGE but imageUrl is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fetchMeOk());
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'no image',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
      },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('imageUrl is required');
  });

  it('returns error if image download fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fetchMeOk())
      .mockResolvedValueOnce(new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'broken image',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: 'https://example.com/missing.png',
      },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to download image');
  });

  it('returns error if image download throws network error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fetchMeOk())
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'broken',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: 'https://example.com/photo.png',
      },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  });

  it('returns error if registerUpload returns non-OK (422)', async () => {
    // 422 is a client error; fetchWithRetry returns the response, our wrapper throws "LinkedIn API error".
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fetchMeOk())
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'invalid owner' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'register fail',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: 'https://example.com/photo.png',
      },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('LinkedIn API error');
    expect(result.error).toContain('invalid owner');
  });

  it('returns error if registerUpload response is missing uploadUrl', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fetchMeOk())
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ value: { asset: 'urn:li:digitalmediaAsset:x' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'malformed register',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: 'https://example.com/photo.png',
      },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('uploadUrl');
  });

  it('returns error if registerUpload response is missing asset URN', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fetchMeOk())
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({
          value: {
            uploadMechanism: {
              'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
                uploadUrl: 'https://api.linkedin.com/mediaUpload/xyz',
              },
            },
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'malformed register 2',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: 'https://example.com/photo.png',
      },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('asset');
  });

  it('returns error if binary PUT fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fetchMeOk())
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({
          value: {
            asset: 'urn:li:digitalmediaAsset:xyz',
            uploadMechanism: {
              'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
                uploadUrl: 'https://api.linkedin.com/mediaUpload/xyz',
              },
            },
          },
        })
      )
      .mockResolvedValueOnce(new Response('upload failed', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'put fails',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: 'https://example.com/photo.png',
      },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('LinkedIn image upload failed');
  });

  it('returns error if binary PUT network-fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fetchMeOk())
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({
          value: {
            asset: 'urn:li:digitalmediaAsset:xyz',
            uploadMechanism: {
              'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
                uploadUrl: 'https://api.linkedin.com/mediaUpload/xyz',
              },
            },
          },
        })
      )
      .mockRejectedValueOnce(new Error('connection reset'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      {
        text: 'put network fail',
        visibility: 'PUBLIC',
        postAs: 'person',
        mediaCategory: 'IMAGE',
        imageUrl: 'https://example.com/photo.png',
      },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('connection reset');
  });
});

// ─── LinkedIn response handling ───────────────────────────────────────────────

describe('linkedin_create_post — LinkedIn response handling', () => {
  it('returns error when X-RestLi-Id header is missing from 201 response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(ugcPostsResponse(null));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      { text: 'hi', visibility: 'PUBLIC', postAs: 'person', mediaCategory: 'NONE' },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('X-RestLi-Id');
  });

  it('returns error when X-RestLi-Id header is empty string', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(ugcPostsResponse(''));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      { text: 'hi', visibility: 'PUBLIC', postAs: 'person', mediaCategory: 'NONE' },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('X-RestLi-Id');
  });

  it('returns error on LinkedIn API non-OK response to /v2/ugcPosts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'invalid payload' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      { text: 'bad', visibility: 'PUBLIC', postAs: 'person', mediaCategory: 'NONE' },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('LinkedIn API error');
    expect(result.error).toContain('invalid payload');
  });

  it('returns error on network failure during /v2/ugcPosts', async () => {
    // fetchWithRetry retries network errors up to maxRetries=3. Use mockRejectedValue
    // (not -Once) so every retry attempt also rejects with the same error.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.endsWith('/v2/me')) {
        return Promise.resolve(jsonResponse({ id: 'abc' }));
      }
      return Promise.reject(new Error('network down'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      { text: 'hi', visibility: 'PUBLIC', postAs: 'person', mediaCategory: 'NONE' },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  }, 15000);

  it('returns error on network failure during /v2/me', async () => {
    // All fetch calls reject; fetchWithRetry retries 3 times then propagates lastError.
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkedinCreatePostNode.executor(
      { text: 'hi', visibility: 'PUBLIC', postAs: 'person', mediaCategory: 'NONE' },
      withCredentials
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  }, 15000);
});
