import { z } from 'zod';
import { defineNode } from '@jam-nodes/core';
import { getRedditAccessToken, redditRequest, formatRedditErrors } from './reddit-client.js';

interface RedditSubmitResponse {
  json?: {
    errors?: unknown[];
    data?: {
      id?: string;
      name?: string;
      url?: string;
    };
  };
}

export const RedditCreatePostInputSchema = z
  .object({
    subreddit: z.string().min(1),
    title: z.string().min(1).max(300),
    kind: z.enum(['self', 'link', 'image']),
    text: z.string().optional(),
    url: z.string().url().optional(),
    flair: z.string().optional(),
    sendReplies: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'self' && !data.text) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'text is required when kind is "self"',
      });
    }
    if ((data.kind === 'link' || data.kind === 'image') && !data.url) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: `url is required when kind is "${data.kind}"`,
      });
    }
  });

export type RedditCreatePostInput = z.infer<typeof RedditCreatePostInputSchema>;

export const RedditCreatePostOutputSchema = z.object({
  postId: z.string(),
  postName: z.string(),
  url: z.string(),
  permalink: z.string(),
  title: z.string(),
  subreddit: z.string(),
});

export type RedditCreatePostOutput = z.infer<typeof RedditCreatePostOutputSchema>;

export const redditCreatePostNode = defineNode({
  type: 'reddit_create_post',
  name: 'Reddit Create Post',
  description: 'Create a new post (self, link, or image) in a subreddit',
  category: 'integration',
  inputSchema: RedditCreatePostInputSchema,
  outputSchema: RedditCreatePostOutputSchema,
  estimatedDuration: 8,
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

      const body = new URLSearchParams();
      body.set('api_type', 'json');
      body.set('sr', input.subreddit);
      body.set('title', input.title);
      body.set('kind', input.kind);
      if (input.kind === 'self' && input.text !== undefined) {
        body.set('text', input.text);
      }
      if ((input.kind === 'link' || input.kind === 'image') && input.url !== undefined) {
        body.set('url', input.url);
      }
      if (input.flair !== undefined) {
        body.set('flair_id', input.flair);
      }
      if (input.sendReplies !== undefined) {
        body.set('sendreplies', input.sendReplies ? 'true' : 'false');
      }

      const response = await redditRequest<RedditSubmitResponse>(context, '/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const errors = response.json?.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        return {
          success: false,
          error: `Reddit API error: ${formatRedditErrors(errors)}`,
        };
      }

      const data = response.json?.data;
      const postId = data?.id;
      const postName = data?.name;
      const postUrl = data?.url;
      if (!postId || !postName || !postUrl) {
        return {
          success: false,
          error: 'Reddit API returned an invalid create post response.',
        };
      }

      const permalink = `https://www.reddit.com/r/${encodeURIComponent(input.subreddit)}/comments/${encodeURIComponent(postId)}/`;

      return {
        success: true,
        output: {
          postId,
          postName,
          url: postUrl,
          permalink,
          title: input.title,
          subreddit: input.subreddit,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create Reddit post',
      };
    }
  },
});
