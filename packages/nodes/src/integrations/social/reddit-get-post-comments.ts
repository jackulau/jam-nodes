import { z } from 'zod';
import { defineNode } from '@jam-nodes/core';
import { getRedditAccessToken, redditRequest } from './reddit-client.js';

interface RedditCommentData {
  id?: string;
  name?: string;
  author?: string;
  body?: string;
  score?: number;
  created_utc?: number;
  permalink?: string;
  parent_id?: string;
  replies?: RedditCommentListing | '' | null;
}

interface RedditCommentChild {
  kind?: string;
  data?: RedditCommentData;
}

interface RedditCommentListing {
  kind?: string;
  data?: {
    children?: RedditCommentChild[];
  };
}

type RedditGetCommentsResponse = RedditCommentListing[];

export const RedditGetPostCommentsInputSchema = z.object({
  postId: z.string().min(1),
  sort: z
    .enum(['confidence', 'top', 'new', 'controversial', 'old', 'qa'])
    .optional()
    .default('confidence'),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

export type RedditGetPostCommentsInput = z.infer<typeof RedditGetPostCommentsInputSchema>;

const RedditCommentSchema = z.object({
  id: z.string(),
  name: z.string(),
  author: z.string(),
  body: z.string(),
  score: z.number(),
  createdUtc: z.number(),
  permalink: z.string(),
  parentId: z.string(),
  depth: z.number(),
});

export const RedditGetPostCommentsOutputSchema = z.object({
  postId: z.string(),
  comments: z.array(RedditCommentSchema),
  count: z.number(),
});

export type RedditGetPostCommentsOutput = z.infer<typeof RedditGetPostCommentsOutputSchema>;

function stripPostIdPrefix(postId: string): string {
  if (postId.startsWith('t3_')) {
    return postId.slice(3);
  }
  return postId;
}

interface QueueEntry {
  child: RedditCommentChild;
  depth: number;
}

function flattenCommentTree(
  root: RedditCommentListing | undefined
): z.infer<typeof RedditCommentSchema>[] {
  const flat: z.infer<typeof RedditCommentSchema>[] = [];
  if (!root || !Array.isArray(root.data?.children)) return flat;

  const queue: QueueEntry[] = root.data!.children!.map((child) => ({ child, depth: 0 }));

  while (queue.length > 0) {
    const entry = queue.shift()!;
    const { child, depth } = entry;

    if (child.kind !== 't1' || !child.data) {
      // Skip 'more' stubs and anything that isn't a comment.
      continue;
    }

    const d = child.data;
    flat.push({
      id: d.id ?? '',
      name: d.name ?? '',
      author: d.author ?? '',
      body: d.body ?? '',
      score: d.score ?? 0,
      createdUtc: d.created_utc ?? 0,
      permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : '',
      parentId: d.parent_id ?? '',
      depth,
    });

    const replies = d.replies;
    if (replies && typeof replies === 'object' && Array.isArray(replies.data?.children)) {
      for (const reply of replies.data!.children!) {
        queue.push({ child: reply, depth: depth + 1 });
      }
    }
  }

  return flat;
}

export const redditGetPostCommentsNode = defineNode({
  type: 'reddit_get_post_comments',
  name: 'Reddit Get Post Comments',
  description: 'Fetch the comment tree for a Reddit post (flattened, with depth)',
  category: 'integration',
  inputSchema: RedditGetPostCommentsInputSchema,
  outputSchema: RedditGetPostCommentsOutputSchema,
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

      const strippedId = stripPostIdPrefix(input.postId);
      const params = new URLSearchParams();
      params.set('sort', String(input.sort));
      params.set('limit', String(input.limit));

      const path = `/comments/${encodeURIComponent(strippedId)}?${params.toString()}`;

      const response = await redditRequest<RedditGetCommentsResponse>(context, path, {
        method: 'GET',
      });

      // Response is [postListing, commentListing]. We only need the second.
      const commentListing = Array.isArray(response) ? response[1] : undefined;
      const comments = flattenCommentTree(commentListing);

      return {
        success: true,
        output: {
          postId: strippedId,
          comments,
          count: comments.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch Reddit post comments',
      };
    }
  },
});
