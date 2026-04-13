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

export const RedditReplyToCommentInputSchema = z.object({
  commentId: z.string().min(1),
  text: z.string().min(1),
});

export type RedditReplyToCommentInput = z.infer<typeof RedditReplyToCommentInputSchema>;

export const RedditReplyToCommentOutputSchema = z.object({
  commentId: z.string(),
  commentName: z.string(),
  permalink: z.string(),
});

export type RedditReplyToCommentOutput = z.infer<typeof RedditReplyToCommentOutputSchema>;

function normalizeCommentThingId(commentId: string): string {
  if (commentId.startsWith('t1_') || commentId.startsWith('t3_')) {
    return commentId;
  }
  return `t1_${commentId}`;
}

export const redditReplyToCommentNode = defineNode({
  type: 'reddit_reply_to_comment',
  name: 'Reddit Reply To Comment',
  description: 'Post a reply to an existing Reddit comment',
  category: 'integration',
  inputSchema: RedditReplyToCommentInputSchema,
  outputSchema: RedditReplyToCommentOutputSchema,
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
      body.set('thing_id', normalizeCommentThingId(input.commentId));
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
          error: 'Reddit API returned an invalid reply response.',
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
        error: error instanceof Error ? error.message : 'Failed to reply to Reddit comment',
      };
    }
  },
});
