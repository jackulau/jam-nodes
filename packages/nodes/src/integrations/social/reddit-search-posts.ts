import { z } from 'zod';
import { defineNode } from '@jam-nodes/core';
import { getRedditAccessToken, redditRequest } from './reddit-client.js';

interface RedditListingResponse {
  kind?: string;
  data?: {
    after?: string | null;
    children?: Array<{
      kind?: string;
      data?: {
        id?: string;
        name?: string;
        title?: string;
        author?: string;
        subreddit?: string;
        selftext?: string;
        url?: string;
        permalink?: string;
        score?: number;
        num_comments?: number;
        created_utc?: number;
        upvote_ratio?: number;
      };
    }>;
  };
}

export const RedditSearchPostsInputSchema = z.object({
  query: z.string().min(1),
  subreddit: z.string().optional(),
  sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).optional().default('new'),
  time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().default('day'),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

export type RedditSearchPostsInput = z.infer<typeof RedditSearchPostsInputSchema>;

const SearchedPostSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  author: z.string(),
  subreddit: z.string(),
  selftext: z.string(),
  url: z.string(),
  permalink: z.string(),
  score: z.number(),
  numComments: z.number(),
  createdUtc: z.number(),
  upvoteRatio: z.number(),
});

export const RedditSearchPostsOutputSchema = z.object({
  posts: z.array(SearchedPostSchema),
  after: z.string().nullable(),
  resultCount: z.number(),
});

export type RedditSearchPostsOutput = z.infer<typeof RedditSearchPostsOutputSchema>;

export const redditSearchPostsNode = defineNode({
  type: 'reddit_search_posts',
  name: 'Reddit Search Posts',
  description: 'Search Reddit posts (optionally restricted to a subreddit)',
  category: 'integration',
  inputSchema: RedditSearchPostsInputSchema,
  outputSchema: RedditSearchPostsOutputSchema,
  estimatedDuration: 10,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input, context) => {
    try {
      if (!getRedditAccessToken(context)) {
        return {
          success: false,
          error:
            'Reddit access token not configured. Please provide context.credentials.reddit.accessToken.',
        };
      }

      const params = new URLSearchParams();
      params.set('q', input.query);
      params.set('sort', String(input.sort));
      params.set('t', String(input.time));
      params.set('limit', String(input.limit));
      params.set('type', 'link');
      params.set('restrict_sr', input.subreddit ? 'on' : 'off');

      const path = input.subreddit
        ? `/r/${encodeURIComponent(input.subreddit)}/search?${params.toString()}`
        : `/search?${params.toString()}`;

      const response = await redditRequest<RedditListingResponse>(context, path, {
        method: 'GET',
      });

      const children = response.data?.children || [];
      const posts = children.map((child) => {
        const d = child.data || {};
        const permalink = d.permalink ? `https://www.reddit.com${d.permalink}` : '';
        return {
          id: d.id ?? '',
          name: d.name ?? '',
          title: d.title ?? '',
          author: d.author ?? '',
          subreddit: d.subreddit ?? '',
          selftext: d.selftext ?? '',
          url: d.url ?? '',
          permalink,
          score: d.score ?? 0,
          numComments: d.num_comments ?? 0,
          createdUtc: d.created_utc ?? 0,
          upvoteRatio: d.upvote_ratio ?? 0,
        };
      });

      const rawAfter = response.data?.after;
      const after = typeof rawAfter === 'string' ? rawAfter : null;

      return {
        success: true,
        output: {
          posts,
          after,
          resultCount: posts.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search Reddit posts',
      };
    }
  },
});
