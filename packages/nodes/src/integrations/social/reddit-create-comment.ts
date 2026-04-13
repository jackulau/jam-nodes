import { z } from 'zod';
import { defineNode } from '@jam-nodes/core';
import { getRedditAccessToken, redditRequest, formatRedditErrors } from './reddit-client.js';

interface RedditCommentResponse {
  json?: {
    errors?: unknown[];
    data?: {
      things?: Array<{
        kind?: string;
        data?: {
          id?: string;
          name?: string;
          permalink?: string;
        };
      }>;
    };
  };
}

export const RedditCreateCommentInputSchema = z.object({
  postId: z.string().min(1),
  text: z.string().min(1),
});

export type RedditCreateCommentInput = z.infer<typeof RedditCreateCommentInputSchema>;

export const RedditCreateCommentOutputSchema = z.object({
  commentId: z.string(),
  commentName: z.string(),
  permalink: z.string(),
});

export type RedditCreateCommentOutput = z.infer<typeof RedditCreateCommentOutputSchema>;

function normalizePostThingId(postId: string): string {
  if (postId.startsWith('t3_') || postId.startsWith('t1_')) {
    return postId;
  }
  return `t3_${postId}`;
}

export const redditCreateCommentNode = defineNode({
  type: 'reddit_create_comment',
  name: 'Reddit Create Comment',
  description: 'Post a top-level comment on a Reddit post',
  category: 'integration',
  inputSchema: RedditCreateCommentInputSchema,
  outputSchema: RedditCreateCommentOutputSchema,
  estimatedDuration: 6,
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
      body.set('thing_id', normalizePostThingId(input.postId));
      body.set('text', input.text);

      const response = await redditRequest<RedditCommentResponse>(context, '/api/comment', {
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

      const thing = response.json?.data?.things?.[0];
      const commentId = thing?.data?.id;
      const commentName = thing?.data?.name;
      const rawPermalink = thing?.data?.permalink;

      if (!commentId || !commentName) {
        return {
          success: false,
          error: 'Reddit API returned an invalid create comment response.',
        };
      }

      const permalink = rawPermalink ? `https://www.reddit.com${rawPermalink}` : '';

      return {
        success: true,
        output: {
          commentId,
          commentName,
          permalink,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create Reddit comment',
      };
    }
  },
});
