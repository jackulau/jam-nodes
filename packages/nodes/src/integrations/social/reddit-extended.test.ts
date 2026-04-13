import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  redditCredential,
  redditCreatePostNode,
  RedditCreatePostInputSchema,
  redditCreateCommentNode,
  redditReplyToCommentNode,
  redditSearchPostsNode,
  RedditSearchPostsInputSchema,
  redditGetPostCommentsNode,
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Credential ───────────────────────────────────────────────────────────────

describe('reddit credential', () => {
  it('defines oauth2 credential metadata', () => {
    expect(redditCredential.name).toBe('reddit');
    expect(redditCredential.type).toBe('oauth2');
    expect(redditCredential.config.authorizationUrl).toBe(
      'https://www.reddit.com/api/v1/authorize'
    );
    expect(redditCredential.config.tokenUrl).toBe(
      'https://www.reddit.com/api/v1/access_token'
    );
  });

  it('includes required scopes', () => {
    const scopes = redditCredential.config.scopes;
    expect(scopes).toEqual(['identity', 'submit', 'read', 'history', 'mysubreddits']);
  });

  it('schema validates complete credentials', () => {
    const result = redditCredential.schema.safeParse({
      clientId: 'c1',
      clientSecret: 's1',
      accessToken: 'a1',
      refreshToken: 'r1',
      expiresAt: 1234567890,
    });
    expect(result.success).toBe(true);
  });

  it('schema rejects missing accessToken', () => {
    const result = redditCredential.schema.safeParse({
      clientId: 'c1',
      clientSecret: 's1',
    });
    expect(result.success).toBe(false);
  });
});

// ─── reddit_create_post ───────────────────────────────────────────────────────

describe('reddit_create_post', () => {
  it('fails when access token is missing', async () => {
    const result = await redditCreatePostNode.executor(
      { subreddit: 'typescript', title: 'hello', kind: 'self', text: 'body' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('credentials.reddit.accessToken');
  });

  it('creates self post with form-encoded body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [],
          data: {
            id: 'abc123',
            name: 't3_abc123',
            url: 'https://www.reddit.com/r/typescript/comments/abc123/hello/',
          },
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditCreatePostNode.executor(
      {
        subreddit: 'typescript',
        title: 'hello',
        kind: 'self',
        text: 'this is the body',
        sendReplies: true,
      },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      postId: 'abc123',
      postName: 't3_abc123',
      subreddit: 'typescript',
      title: 'hello',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth.reddit.com/api/submit');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer r_token');
    expect(headers['User-Agent']).toBe('jam-nodes/1.0');
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = String(init.body);
    expect(body).toContain('kind=self');
    expect(body).toContain('sr=typescript');
    expect(body).toContain('title=hello');
    expect(body).toContain('text=this+is+the+body');
    expect(body).toContain('sendreplies=true');
    expect(body).toContain('api_type=json');
  });

  it('creates link post with url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [],
          data: {
            id: 'link1',
            name: 't3_link1',
            url: 'https://example.com/',
          },
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditCreatePostNode.executor(
      {
        subreddit: 'webdev',
        title: 'check this',
        kind: 'link',
        url: 'https://example.com/',
      },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);
    expect(body).toContain('kind=link');
    expect(body).toContain('url=https%3A%2F%2Fexample.com%2F');
  });

  it('rejects self post without text at schema level', () => {
    const result = RedditCreatePostInputSchema.safeParse({
      subreddit: 'typescript',
      title: 'hello',
      kind: 'self',
    });
    expect(result.success).toBe(false);
  });

  it('returns error when reddit json.errors is non-empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [['SUBREDDIT_NOEXIST', 'that subreddit does not exist', null]],
          data: null,
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditCreatePostNode.executor(
      {
        subreddit: 'nonexistent_xyz',
        title: 'hello',
        kind: 'self',
        text: 'body',
      },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('SUBREDDIT_NOEXIST');
  });

  it('encodes special characters in title', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [],
          data: { id: 'x1', name: 't3_x1', url: 'https://www.reddit.com/x' },
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await redditCreatePostNode.executor(
      {
        subreddit: 'typescript',
        title: 'hello & world',
        kind: 'self',
        text: 'body',
      },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);
    expect(body).toContain('title=hello+%26+world');
  });
});

// ─── reddit_create_comment ────────────────────────────────────────────────────

describe('reddit_create_comment', () => {
  it('fails when access token is missing', async () => {
    const result = await redditCreateCommentNode.executor(
      { postId: 'abc123', text: 'nice post' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('credentials.reddit.accessToken');
  });

  it('creates comment on post with t3_ prefix added', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [],
          data: {
            things: [
              {
                kind: 't1',
                data: {
                  id: 'c1',
                  name: 't1_c1',
                  permalink: '/r/typescript/comments/abc123/_/c1/',
                },
              },
            ],
          },
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditCreateCommentNode.executor(
      { postId: 'abc123', text: 'nice post' },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      commentId: 'c1',
      commentName: 't1_c1',
      permalink: 'https://www.reddit.com/r/typescript/comments/abc123/_/c1/',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth.reddit.com/api/comment');
    const body = String(init.body);
    expect(body).toContain('thing_id=t3_abc123');
    expect(body).toContain('text=nice+post');
  });

  it('passes through existing t3_ prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [],
          data: {
            things: [
              {
                kind: 't1',
                data: { id: 'c2', name: 't1_c2', permalink: '/x/' },
              },
            ],
          },
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await redditCreateCommentNode.executor(
      { postId: 't3_abc123', text: 'hi' },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);
    expect(body).toContain('thing_id=t3_abc123');
    expect(body).not.toContain('thing_id=t3_t3_');
  });

  it('returns error when reddit json.errors is non-empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [['TOO_OLD', 'this thing is archived', 'text']],
          data: null,
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditCreateCommentNode.executor(
      { postId: 'abc123', text: 'hi' },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('TOO_OLD');
  });

  it('parses comment id and permalink from response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [],
          data: {
            things: [
              {
                kind: 't1',
                data: {
                  id: 'xyz9',
                  name: 't1_xyz9',
                  permalink: '/r/foo/comments/abc/_/xyz9/',
                },
              },
            ],
          },
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditCreateCommentNode.executor(
      { postId: 'abc', text: 'hi' },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    expect(result.output?.commentId).toBe('xyz9');
    expect(result.output?.commentName).toBe('t1_xyz9');
    expect(result.output?.permalink).toBe('https://www.reddit.com/r/foo/comments/abc/_/xyz9/');
  });
});

// ─── reddit_reply_to_comment ──────────────────────────────────────────────────

describe('reddit_reply_to_comment', () => {
  it('fails when access token is missing', async () => {
    const result = await redditReplyToCommentNode.executor(
      { commentId: 'xyz789', text: 'reply' },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('credentials.reddit.accessToken');
  });

  it('replies to comment with t1_ prefix added', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [],
          data: {
            things: [
              {
                kind: 't1',
                data: { id: 'r1', name: 't1_r1', permalink: '/r/x/_/r1/' },
              },
            ],
          },
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await redditReplyToCommentNode.executor(
      { commentId: 'xyz789', text: 'reply text' },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth.reddit.com/api/comment');
    const body = String(init.body);
    expect(body).toContain('thing_id=t1_xyz789');
    expect(body).toContain('text=reply+text');
  });

  it('passes through existing t1_ prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [],
          data: {
            things: [
              {
                kind: 't1',
                data: { id: 'r2', name: 't1_r2', permalink: '/x/' },
              },
            ],
          },
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await redditReplyToCommentNode.executor(
      { commentId: 't1_xyz789', text: 'hi' },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);
    expect(body).toContain('thing_id=t1_xyz789');
    expect(body).not.toContain('thing_id=t1_t1_');
  });

  it('returns error when reddit json.errors is non-empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        json: {
          errors: [['RATELIMIT', 'you are doing that too much', null]],
          data: null,
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditReplyToCommentNode.executor(
      { commentId: 'xyz789', text: 'hi' },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('RATELIMIT');
  });
});

// ─── reddit_search_posts ──────────────────────────────────────────────────────

describe('reddit_search_posts', () => {
  it('fails when access token is missing', async () => {
    const result = await redditSearchPostsNode.executor(
      { query: 'typescript', sort: 'new', time: 'day', limit: 25 },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('credentials.reddit.accessToken');
  });

  it('searches across all subreddits when no subreddit given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { after: null, children: [] },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await redditSearchPostsNode.executor(
      { query: 'typescript', sort: 'new', time: 'day', limit: 25 },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://oauth.reddit.com/search?');
    expect(url).toContain('q=typescript');
    expect(url).toContain('restrict_sr=off');
  });

  it('restricts to subreddit when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { after: null, children: [] } })
    );
    vi.stubGlobal('fetch', fetchMock);

    await redditSearchPostsNode.executor(
      { query: 'hooks', subreddit: 'typescript', sort: 'new', time: 'day', limit: 25 },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://oauth.reddit.com/r/typescript/search?');
    expect(url).toContain('restrict_sr=on');
  });

  it('applies default sort and time via schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { after: null, children: [] } })
    );
    vi.stubGlobal('fetch', fetchMock);

    // Rely on schema defaults — caller only passes query.
    const result = await redditSearchPostsNode.executor(
      RedditSearchPostsInputSchema.parse({ query: 'hooks' }),
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('sort=new');
    expect(url).toContain('t=day');
    expect(url).toContain('limit=25');
  });

  it('rejects limit above 100 at schema level', () => {
    const result = RedditSearchPostsInputSchema.safeParse({
      query: 'x',
      limit: 500,
    });
    expect(result.success).toBe(false);
  });

  it('returns normalized post shape with after token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          after: 't3_last',
          children: [
            {
              kind: 't3',
              data: {
                id: 'p1',
                name: 't3_p1',
                title: 'First',
                author: 'alice',
                subreddit: 'typescript',
                selftext: 'body',
                url: 'https://www.reddit.com/r/typescript/comments/p1/',
                permalink: '/r/typescript/comments/p1/',
                score: 42,
                num_comments: 7,
                created_utc: 1700000000,
                upvote_ratio: 0.95,
              },
            },
            {
              kind: 't3',
              data: {
                id: 'p2',
                name: 't3_p2',
                title: 'Second',
                author: 'bob',
                subreddit: 'typescript',
                selftext: '',
                url: 'https://example.com/',
                permalink: '/r/typescript/comments/p2/',
                score: 10,
                num_comments: 2,
                created_utc: 1700000100,
                upvote_ratio: 0.8,
              },
            },
          ],
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditSearchPostsNode.executor(
      { query: 'typescript', sort: 'new', time: 'day', limit: 25 },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    expect(result.output?.after).toBe('t3_last');
    expect(result.output?.resultCount).toBe(2);
    expect(result.output?.posts[0]).toMatchObject({
      id: 'p1',
      title: 'First',
      author: 'alice',
      score: 42,
      numComments: 7,
      permalink: 'https://www.reddit.com/r/typescript/comments/p1/',
    });
  });

  it('handles empty result set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { after: null, children: [] } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditSearchPostsNode.executor(
      { query: 'nonexistent_xyz_qqq', sort: 'new', time: 'day', limit: 25 },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ posts: [], after: null, resultCount: 0 });
  });
});

// ─── reddit_get_post_comments ─────────────────────────────────────────────────

describe('reddit_get_post_comments', () => {
  it('fails when access token is missing', async () => {
    const result = await redditGetPostCommentsNode.executor(
      { postId: 'abc123', sort: 'confidence', limit: 100 },
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('credentials.reddit.accessToken');
  });

  it('fetches comments for post with sort and limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { data: { children: [] } },
        { data: { children: [] } },
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    await redditGetPostCommentsNode.executor(
      { postId: 'abc123', sort: 'confidence', limit: 100 },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://oauth.reddit.com/comments/abc123?');
    expect(url).toContain('sort=confidence');
    expect(url).toContain('limit=100');
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('jam-nodes/1.0');
  });

  it('strips t3_ prefix from postId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ data: { children: [] } }, { data: { children: [] } }])
    );
    vi.stubGlobal('fetch', fetchMock);

    await redditGetPostCommentsNode.executor(
      { postId: 't3_abc123', sort: 'confidence', limit: 100 },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/comments/abc123?');
    expect(url).not.toContain('/comments/t3_');
  });

  it('flattens nested replies with depth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { data: { children: [] } },
        {
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'c1',
                  name: 't1_c1',
                  author: 'alice',
                  body: 'top level',
                  score: 5,
                  created_utc: 1700000000,
                  permalink: '/r/x/_/c1/',
                  parent_id: 't3_abc123',
                  replies: {
                    kind: 'Listing',
                    data: {
                      children: [
                        {
                          kind: 't1',
                          data: {
                            id: 'c2',
                            name: 't1_c2',
                            author: 'bob',
                            body: 'nested',
                            score: 2,
                            created_utc: 1700000100,
                            permalink: '/r/x/_/c2/',
                            parent_id: 't1_c1',
                            replies: '',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditGetPostCommentsNode.executor(
      { postId: 'abc123', sort: 'confidence', limit: 100 },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    expect(result.output?.count).toBe(2);
    expect(result.output?.comments[0]).toMatchObject({ id: 'c1', depth: 0, author: 'alice' });
    expect(result.output?.comments[1]).toMatchObject({ id: 'c2', depth: 1, author: 'bob' });
  });

  it('skips "more" stubs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { data: { children: [] } },
        {
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'real',
                  name: 't1_real',
                  author: 'alice',
                  body: 'hi',
                  score: 1,
                  created_utc: 0,
                  permalink: '/x/',
                  parent_id: 't3_p1',
                  replies: '',
                },
              },
              {
                kind: 'more',
                data: { count: 10, children: ['m1', 'm2'] },
              },
            ],
          },
        },
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditGetPostCommentsNode.executor(
      { postId: 'p1', sort: 'confidence', limit: 100 },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    expect(result.output?.count).toBe(1);
    expect(result.output?.comments[0]?.id).toBe('real');
  });

  it('handles empty comments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ data: { children: [] } }, { data: { children: [] } }])
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditGetPostCommentsNode.executor(
      { postId: 'p1', sort: 'confidence', limit: 100 },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    expect(result.output?.count).toBe(0);
    expect(result.output?.comments).toEqual([]);
  });

  it('handles deeply nested threads without stack overflow', async () => {
    // Build a chain of 50 nested replies.
    const buildChain = (depthLeft: number, idCounter: { n: number }): unknown => {
      const id = `c${idCounter.n++}`;
      const node: Record<string, unknown> = {
        kind: 't1',
        data: {
          id,
          name: `t1_${id}`,
          author: 'alice',
          body: `body ${id}`,
          score: 1,
          created_utc: 0,
          permalink: `/x/${id}/`,
          parent_id: 't3_p1',
          replies: '',
        },
      };
      if (depthLeft > 0) {
        (node.data as Record<string, unknown>).replies = {
          kind: 'Listing',
          data: { children: [buildChain(depthLeft - 1, idCounter)] },
        };
      }
      return node;
    };

    const chain = buildChain(49, { n: 0 });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ data: { children: [] } }, { data: { children: [chain] } }])
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await redditGetPostCommentsNode.executor(
      { postId: 'p1', sort: 'confidence', limit: 100 },
      { ...baseContext, credentials: { reddit: { accessToken: 'r_token' } } }
    );

    expect(result.success).toBe(true);
    expect(result.output?.count).toBe(50);
    expect(result.output?.comments[0]?.depth).toBe(0);
    expect(result.output?.comments[49]?.depth).toBe(49);
  });
});
