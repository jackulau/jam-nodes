import { z } from 'zod';
import { defineNode } from '@jam-nodes/core';
import {
  getLinkedInAccessToken,
  getAuthenticatedLinkedInPersonUrn,
  linkedInRequest,
  registerLinkedInUpload,
  uploadLinkedInBinary,
} from './linkedin-client.js';

export const LinkedInCreatePostInputSchema = z.object({
  text: z.string().min(1).max(3000),
  visibility: z.enum(['PUBLIC', 'CONNECTIONS']),
  postAs: z.enum(['person', 'organization']),
  organizationId: z.string().optional(),
  mediaCategory: z.enum(['NONE', 'IMAGE', 'ARTICLE']).optional().default('NONE'),
  imageUrl: z.string().optional(),
  articleUrl: z.string().optional(),
  articleTitle: z.string().optional(),
  articleDescription: z.string().optional(),
});

export type LinkedInCreatePostInput = z.infer<typeof LinkedInCreatePostInputSchema>;

export const LinkedInCreatePostOutputSchema = z.object({
  postId: z.string(),
  author: z.string(),
});

export type LinkedInCreatePostOutput = z.infer<typeof LinkedInCreatePostOutputSchema>;

const URN_PREFIX = 'urn:li:digitalmediaasset:';

interface ShareMedia {
  status: 'READY';
  originalUrl?: string;
  media?: string;
  title?: { text: string };
  description?: { text: string };
}

interface UgcPostBody {
  author: string;
  lifecycleState: 'PUBLISHED';
  specificContent: {
    'com.linkedin.ugc.ShareContent': {
      shareCommentary: { text: string };
      shareMediaCategory: 'NONE' | 'IMAGE' | 'ARTICLE';
      media?: ShareMedia[];
    };
  };
  visibility: {
    'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' | 'CONNECTIONS';
  };
}

export const linkedinCreatePostNode = defineNode({
  type: 'linkedin_create_post',
  name: 'LinkedIn Create Post',
  description:
    'Create a new post on LinkedIn as a person or organization, with optional article or image media.',
  category: 'integration',
  inputSchema: LinkedInCreatePostInputSchema,
  outputSchema: LinkedInCreatePostOutputSchema,
  estimatedDuration: 10,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input, context) => {
    try {
      const accessToken = getLinkedInAccessToken(context);
      if (!accessToken) {
        return {
          success: false,
          error:
            'LinkedIn access token not configured. Please provide context.credentials.linkedin.accessToken.',
        };
      }

      let authorUrn: string;
      if (input.postAs === 'organization') {
        if (!input.organizationId) {
          return {
            success: false,
            error: 'organizationId is required when postAs is "organization".',
          };
        }
        authorUrn = `urn:li:organization:${input.organizationId}`;
      } else {
        authorUrn = await getAuthenticatedLinkedInPersonUrn(context);
      }

      const mediaCategory = input.mediaCategory ?? 'NONE';

      const shareContent: UgcPostBody['specificContent']['com.linkedin.ugc.ShareContent'] = {
        shareCommentary: { text: input.text },
        shareMediaCategory: mediaCategory,
      };

      if (mediaCategory === 'ARTICLE') {
        if (!input.articleUrl) {
          return {
            success: false,
            error: 'articleUrl is required when mediaCategory is "ARTICLE".',
          };
        }
        const mediaEntry: ShareMedia = {
          status: 'READY',
          originalUrl: input.articleUrl,
        };
        if (input.articleTitle) {
          mediaEntry.title = { text: input.articleTitle };
        }
        if (input.articleDescription) {
          mediaEntry.description = { text: input.articleDescription };
        }
        shareContent.media = [mediaEntry];
      } else if (mediaCategory === 'IMAGE') {
        if (!input.imageUrl) {
          return {
            success: false,
            error: 'imageUrl is required when mediaCategory is "IMAGE".',
          };
        }

        const normalized = input.imageUrl.trim();
        const isUrn = normalized.toLowerCase().startsWith(URN_PREFIX);

        let assetUrn: string;
        if (isUrn) {
          assetUrn = normalized;
        } else {
          const imgResponse = await fetch(normalized);
          if (!imgResponse.ok) {
            return {
              success: false,
              error: `Failed to download image from imageUrl: ${imgResponse.status} ${imgResponse.statusText}`,
            };
          }
          const binary = await imgResponse.arrayBuffer();

          const registered = await registerLinkedInUpload(context, authorUrn);
          await uploadLinkedInBinary(registered.uploadUrl, accessToken, binary);
          assetUrn = registered.assetUrn;
        }

        shareContent.media = [
          {
            status: 'READY',
            media: assetUrn,
          },
        ];
      }

      const body: UgcPostBody = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': shareContent,
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': input.visibility,
        },
      };

      const { headers } = await linkedInRequest(context, '/v2/ugcPosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const postId = headers.get('x-restli-id');
      if (!postId || postId.length === 0) {
        return {
          success: false,
          error: 'LinkedIn did not return X-RestLi-Id header on /v2/ugcPosts response.',
        };
      }

      return {
        success: true,
        output: {
          postId,
          author: authorUrn,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create LinkedIn post',
      };
    }
  },
});
